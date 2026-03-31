import { Router, type IRouter } from "express";
import healthRouter from "./health";
import locationsRouter from "./locations";
import productsRouter from "./products";
import stockRouter from "./stock";
import historyRouter from "./history";
import dashboardRouter from "./dashboard";
import authRouter from "./auth";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/locations", requireAuth, locationsRouter);
router.use("/products", requireAuth, productsRouter);
router.use("/stock", requireAuth, stockRouter);
router.use("/history", requireAuth, historyRouter);
router.use("/dashboard", requireAuth, dashboardRouter);

export default router;
