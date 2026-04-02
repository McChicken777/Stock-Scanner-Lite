import { Router, type IRouter } from "express";
import healthRouter from "./health";
import locationsRouter from "./locations";
import productsRouter from "./products";
import stockRouter from "./stock";
import historyRouter from "./history";
import dashboardRouter from "./dashboard";
import authRouter from "./auth";
import workRouter from "./work";
import inboundRouter from "./inbound";
import companyRouter from "./company";
import ownerRouter from "./owner";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/company", requireAuth, companyRouter);
router.use("/owner", ownerRouter);
router.use("/locations", requireAuth, locationsRouter);
router.use("/products", requireAuth, productsRouter);
router.use("/stock", requireAuth, stockRouter);
router.use("/history", requireAuth, historyRouter);
router.use("/dashboard", requireAuth, dashboardRouter);
router.use("/work", requireAuth, workRouter);
router.use("/inbound", requireAuth, inboundRouter);

export default router;
