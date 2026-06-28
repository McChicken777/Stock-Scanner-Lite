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
import tasksRouter from "./tasks";
import ordersRouter from "./orders";
import suppliersRouter from "./suppliers";
import companyRouter from "./company";
import ownerRouter from "./owner";
import purchasingRouter from "./purchasing";
import attendanceRouter from "./attendance";
import customersRouter from "./customers";
import quotesRouter from "./quotes";
import quoteIssuersRouter from "./quote-issuers";
import settingsRouter from "./settings";
import leaveRouter from "./leave";
import analyticsRouter from "./analytics";
import stationsRouter from "./stations";
import adminRouter from "./admin";
import kioskRouter from "./kiosk";
import rawMaterialsRouter from "./raw-materials";
import joinRouter from "./join";
import rfqRouter from "./rfq";
import rfqPublicRouter from "./rfq-public";
import catalogRouter from "./catalog";
import quotePublicRouter from "./quote-public";
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
router.use("/tasks", requireAuth, tasksRouter);
router.use("/orders", requireAuth, ordersRouter);
router.use("/suppliers", requireAuth, suppliersRouter);
router.use("/purchase-orders", requireAuth, purchasingRouter);
router.use("/attendance", requireAuth, attendanceRouter);
router.use("/customers", requireAuth, customersRouter);
router.use("/quotes", requireAuth, quotesRouter);
router.use("/quote-issuers", requireAuth, quoteIssuersRouter);
router.use("/settings", requireAuth, settingsRouter);
router.use("/leave", requireAuth, leaveRouter);
router.use("/analytics", analyticsRouter);
router.use("/stations", requireAuth, stationsRouter);
router.use("/admin", requireAuth, adminRouter);
router.use("/kiosk", kioskRouter);
router.use("/raw-materials", requireAuth, rawMaterialsRouter);
router.use("/join", joinRouter); // public — no requireAuth
router.use("/quote-requests", requireAuth, rfqRouter);
router.use("/rfq", rfqPublicRouter); // public — no requireAuth (supplier self-service quotes)
router.use("/catalog", requireAuth, catalogRouter);
router.use("/quote-public", quotePublicRouter); // public — no requireAuth (customer quote acceptance)

export default router;
