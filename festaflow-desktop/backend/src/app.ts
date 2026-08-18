import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./routes/auth";
import clientsRoutes from "./routes/clients";
import employeesRoutes from "./routes/employees";
import servicesRoutes from "./routes/services";
import ordersRoutes from "./routes/orders";
import transactionsRoutes from "./routes/transactions";
import reportsRoutes from "./routes/reports";
import { errorHandler, notFound } from "./middleware/error";

export const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "15mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true, name: "FestaFlow API" }));
app.use("/api/auth", authRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/reports", reportsRoutes);

app.use(notFound);
app.use(errorHandler);
