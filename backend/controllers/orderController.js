import crypto from "node:crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import Order from "../model/Order.js";
import Product from "../model/Product.js";
import Cart from "../model/Cart.js";
import asyncHandler from "../utils/asyncHandler.js";

const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const addressFields = [
  "fullName",
  "phone",
  "line1",
  "city",
  "state",
  "postalCode",
  "country",
];

function getRazorpay() {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET)
    throw new Error("Razorpay is not configured.");
  return new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
  });
}

export const createOrder = asyncHandler(async (req, res) => {
  const {
    items,
    shippingAddress,
    paymentMethod = "cod",
    notes = "",
  } = req.body;
  if (!Array.isArray(items) || items.length < 1 || items.length > 50)
    return res
      .status(400)
      .json({ message: "Provide between 1 and 50 order items." });
  if (
    !shippingAddress ||
    addressFields.some((key) => !String(shippingAddress[key] || "").trim())
  )
    return res
      .status(400)
      .json({ message: "A complete shipping address is required." });
  if (!["cod", "razorpay"].includes(paymentMethod))
    return res.status(400).json({ message: "Unsupported payment method." });
  const quantities = new Map();
  for (const item of items) {
    if (
      !mongoose.isValidObjectId(item.productId) ||
      !Number.isInteger(Number(item.quantity)) ||
      Number(item.quantity) < 1
    )
      return res.status(400).json({
        message: "Each item needs a valid productId and positive quantity.",
      });
    const id = String(item.productId);
    quantities.set(id, (quantities.get(id) || 0) + Number(item.quantity));
  }
  const products = await Product.find({
    _id: { $in: [...quantities.keys()] },
    isActive: true,
  });
  if (products.length !== quantities.size)
    return res
      .status(400)
      .json({ message: "One or more products are unavailable." });
  const snapshots = [];
  let subtotal = 0;
  for (const product of products) {
    const quantity = quantities.get(product.id);
    if (product.stock < quantity)
      return res
        .status(409)
        .json({ message: `Insufficient stock for ${product.name}.` });
    const lineTotal = money(product.price * quantity);
    subtotal += lineTotal;
    snapshots.push({
      product: product._id,
      name: product.name,
      image: product.images[0]?.url || "",
      sku: product.sku || "",
      quantity,
      unitPrice: product.price,
      lineTotal,
    });
  }
  subtotal = money(subtotal);
  const shippingFee = Math.max(0, Number(process.env.SHIPPING_FEE || 0));
  const tax = money(
    (subtotal * Math.max(0, Number(process.env.TAX_RATE || 0))) / 100,
  );
  const total = money(subtotal + shippingFee + tax);
  if (paymentMethod === "razorpay" && total <= 0)
    return res
      .status(400)
      .json({
        message: "Online payment requires an order total greater than zero.",
      });
  let providerOrder;
  if (paymentMethod === "razorpay") {
    providerOrder = await getRazorpay().orders.create({
      amount: Math.round(total * 100),
      currency: products[0].currency,
      receipt: `checkout-${Date.now()}`,
    });
  }
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      for (const product of products) {
        const quantity = quantities.get(product.id);
        const result = await Product.updateOne(
          { _id: product._id, isActive: true, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          { session },
        );
        if (!result.matchedCount)
          throw Object.assign(
            new Error(`Insufficient stock for ${product.name}.`),
            { status: 409 },
          );
      }
      [order] = await Order.create(
        [
          {
            orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
            user: req.user._id,
            items: snapshots,
            shippingAddress,
            subtotal,
            shippingFee,
            tax,
            total,
            currency: products[0].currency,
            paymentMethod,
            orderStatus: paymentMethod === "cod" ? "confirmed" : "pending",
            notes,
            ...(providerOrder
              ? { paymentDetails: { providerOrderId: providerOrder.id } }
              : {}),
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  await Cart.updateOne({ user: req.user._id }, { $set: { items: [] } }).catch(
    (error) => console.error("Unable to clear cart after order:", error),
  );
  res.status(201).json({
    message: "Order placed.",
    order,
    ...(providerOrder
      ? {
          razorpay: {
            keyId: process.env.RAZORPAY_KEY_ID,
            orderId: providerOrder.id,
            amount: providerOrder.amount,
            currency: providerOrder.currency,
          },
        }
      : {}),
  });
});

export const verifyOrderPayment = asyncHandler(async (req, res) => {
  const {
    razorpay_payment_id: paymentId,
    razorpay_order_id: providerOrderId,
    razorpay_signature: signature,
  } = req.body;
  if (!paymentId || !providerOrderId || !signature)
    return res
      .status(400)
      .json({ message: "Razorpay payment details are required." });
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) return res.status(404).json({ message: "Order not found." });
  if (
    order.paymentMethod !== "razorpay" ||
    order.paymentDetails.providerOrderId !== providerOrderId
  )
    return res
      .status(400)
      .json({ message: "Payment does not match this order." });
  if (order.paymentStatus === "paid")
    return res.json({ message: "Payment already verified.", order });
  if (order.orderStatus === "cancelled")
    return res
      .status(409)
      .json({ message: "Cancelled orders cannot accept payment." });
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new Error("RAZORPAY_KEY_SECRET is required.");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${providerOrderId}|${paymentId}`)
    .digest();
  let received;
  try {
    received = Buffer.from(signature, "hex");
  } catch {
    received = Buffer.alloc(0);
  }
  if (
    received.length !== expected.length ||
    !crypto.timingSafeEqual(received, expected)
  )
    return res.status(400).json({ message: "Payment signature is invalid." });
  const razorpay = getRazorpay();
  let payment = await razorpay.payments.fetch(paymentId);
  if (
    payment.order_id !== providerOrderId ||
    payment.amount !== Math.round(order.total * 100) ||
    payment.currency !== order.currency
  )
    return res
      .status(400)
      .json({ message: "Payment details do not match this order." });
  if (payment.status === "authorized")
    payment = await razorpay.payments.capture(
      paymentId,
      payment.amount,
      payment.currency,
    );
  if (payment.status !== "captured")
    return res.status(409).json({ message: "Payment has not been captured." });
  order.paymentStatus = "paid";
  order.paymentDetails.providerPaymentId = paymentId;
  order.orderStatus = "confirmed";
  await order.save();
  res.json({ message: "Payment verified.", order });
});

export const handleRazorpayWebhook = asyncHandler(async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.get("x-razorpay-signature");
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET is required.");
  if (!signature || !Buffer.isBuffer(req.body))
    return res.status(400).json({ message: "Invalid webhook request." });
  const expected = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest();
  const received = Buffer.from(signature, "hex");
  if (
    received.length !== expected.length ||
    !crypto.timingSafeEqual(received, expected)
  )
    return res.status(400).json({ message: "Invalid webhook signature." });
  const event = JSON.parse(req.body.toString("utf8"));
  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id || !payment?.id)
    return res.status(200).json({ received: true });
  const order = await Order.findOne({
    "paymentDetails.providerOrderId": payment.order_id,
  });
  if (!order) return res.status(200).json({ received: true });
  if (event.event === "payment.captured") {
    if (
      payment.amount !== Math.round(order.total * 100) ||
      payment.currency !== order.currency
    )
      return res
        .status(400)
        .json({ message: "Payment amount does not match the order." });
    if (order.orderStatus !== "cancelled") {
      order.paymentStatus = "paid";
      order.paymentDetails.providerPaymentId = payment.id;
      if (order.orderStatus === "pending") order.orderStatus = "confirmed";
      await order.save();
    }
  } else if (
    event.event === "payment.failed" &&
    order.paymentStatus !== "paid"
  ) {
    order.paymentStatus = "failed";
    await order.save();
  }
  res.json({ received: true });
});

export const getMyOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const [orders, total] = await Promise.all([
    Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments({ user: req.user._id }),
  ]);
  res.json({
    orders,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const getOrder = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(400).json({ message: "Invalid order id." });
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) return res.status(404).json({ message: "Order not found." });
  res.json({ order });
});

export const cancelOrder = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(400).json({ message: "Invalid order id." });
  const session = await mongoose.startSession();
  let order;
  let issue;
  try {
    await session.withTransaction(async () => {
      order = await Order.findOne({
        _id: req.params.id,
        user: req.user._id,
      }).session(session);
      if (!order) {
        issue = [404, "Order not found."];
        return;
      }
      if (
        !["pending", "confirmed"].includes(order.orderStatus) ||
        order.paymentStatus === "paid" ||
        (order.paymentMethod === "razorpay" &&
          order.paymentStatus === "pending")
      ) {
        issue = [
          409,
          "This order can no longer be cancelled. Complete or resolve its online payment first.",
        ];
        return;
      }
      for (const item of order.items)
        await Product.updateOne(
          { _id: item.product },
          { $inc: { stock: item.quantity } },
          { session },
        );
      order.orderStatus = "cancelled";
      order.cancelledAt = new Date();
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }
  if (issue) return res.status(issue[0]).json({ message: issue[1] });
  res.json({ message: "Order cancelled.", order });
});

export const listAllOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = req.query.status ? { orderStatus: req.query.status } : {};
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);
  res.json({
    orders,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const statuses = [
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ];
  const payments = ["pending", "paid", "failed", "refunded"];
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(400).json({ message: "Invalid order id." });
  const { orderStatus, paymentStatus, providerPaymentId } = req.body;
  if (orderStatus && !statuses.includes(orderStatus))
    return res.status(400).json({ message: "Invalid order status." });
  if (paymentStatus && !payments.includes(paymentStatus))
    return res.status(400).json({ message: "Invalid payment status." });
  if (paymentStatus === "paid") {
    const target = await Order.findById(req.params.id).select("paymentMethod");
    if (!target) return res.status(404).json({ message: "Order not found." });
    if (target.paymentMethod === "razorpay")
      return res
        .status(400)
        .json({
          message:
            "Razorpay payment status can only be set by verified payment confirmation.",
        });
  }
  const session = await mongoose.startSession();
  let order;
  let issue;
  try {
    await session.withTransaction(async () => {
      order = await Order.findById(req.params.id).session(session);
      if (!order) {
        issue = [404, "Order not found."];
        return;
      }
      if (orderStatus === "cancelled" && order.orderStatus !== "cancelled") {
        const resultingPaymentStatus = paymentStatus || order.paymentStatus;
        if (
          resultingPaymentStatus === "paid" ||
          (order.paymentMethod === "razorpay" &&
            order.paymentStatus !== "failed")
        ) {
          issue = [409, "Refund a paid order before cancelling it."];
          return;
        }
        for (const item of order.items)
          await Product.updateOne(
            { _id: item.product },
            { $inc: { stock: item.quantity } },
            { session },
          );
        order.cancelledAt = new Date();
      }
      if (orderStatus) {
        order.orderStatus = orderStatus;
        if (orderStatus === "delivered") order.deliveredAt = new Date();
      }
      if (paymentStatus) order.paymentStatus = paymentStatus;
      if (providerPaymentId)
        order.paymentDetails.providerPaymentId = providerPaymentId;
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }
  if (issue) return res.status(issue[0]).json({ message: issue[1] });
  res.json({ order });
});
