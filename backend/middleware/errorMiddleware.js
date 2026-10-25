export function notFound(req, res) {
  res
    .status(404)
    .json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error, _req, res, _next) {
  console.error(error);
  if (error.code === 11000)
    return res
      .status(409)
      .json({ message: "A record with this value already exists." });
  if (error.name === "ValidationError")
    return res.status(400).json({ message: error.message });
  if (error.name === "CastError")
    return res.status(400).json({ message: "Invalid resource identifier." });
  if (error.name === "MulterError")
    return res.status(400).json({ message: error.message });
  const status = Number(error.statusCode || error.status) || 500;
  res
    .status(status)
    .json({
      message: status >= 500 ? "Internal server error." : error.message,
    });
}
