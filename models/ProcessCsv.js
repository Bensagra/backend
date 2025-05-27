const mongoose = require("mongoose");
const { Schema } = mongoose;

mongoose.Promise = global.Promise;

const processCSVSchema = new Schema({
  fileContent: {
    type: Schema.Types.Mixed, // más flexible que Object
    required: true,
  },
  status: {
    type: String,
    enum: ["processing", "completed", "failed", "canceled"],
    default: "processing",
  },
  totalRows: {
    type: Number,
    default: 0,
  },
  rowsProcessed: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: {
    type: Date,
  },
  processingTime: {
    type: Number, // tiempo en milisegundos, segundos? documentalo si podés
  },
  requestCount: {
    type: Number,
    default: 0,
  },
});

module.exports = mongoose.model("ProcessCSV", processCSVSchema);