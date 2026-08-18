import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./routes/auth";
import clientRoutes from "./routes/clients";
import employeeRoutes from "./routes/employees";
import serviceRoutes from "./routes/services";
import orderRoutes from "./routes/orders";
import transactionRoutes from "./routes/transactions";
import reportRoutes from "./routes/reports";

const app = express();
const port = Number(process.env.PORT || 3333);

app.use(helmet());
app.use(cors({ origin: ["http://localhost:5173", "app://festaflow"], credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ status: "ok", app: "FestaFlow Local API" }));
app.use("/api/auth", authRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/reports", reportRoutes);

app.listen(port, () => {
  console.log(`FestaFlow Local API running on http://localhost:${port}`);
});