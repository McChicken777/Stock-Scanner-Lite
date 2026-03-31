import { Router, type IRouter } from "express";
import healthRouter from "./health";
import locationsRouter from "./locations";
import productsRouter from "./products";
import stockRouter from "./stock";
import historyRouter from "./history";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/locations", locationsRouter);
router.use("/products", productsRouter);
router.use("/stock", stockRouter);
router.use("/history", historyRouter);
router.use("/dashboard", dashboardRouter);

export default router;
