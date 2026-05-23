import databaseConnection from "./config/mongo_config.js";
import express from "express";
import cors from "cors";
import ingestionRoutes from "./routes/ingestion.routes.js";
import reconcilationRoutes from "./routes/reconciliation.routes.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

await databaseConnection();
app.use("/api/", ingestionRoutes);
app.use("/api/", reconcilationRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
