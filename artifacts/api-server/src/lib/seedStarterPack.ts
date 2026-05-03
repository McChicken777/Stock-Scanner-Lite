import {
  db, workTemplatesTable, workStepsTable,
  productsTable, productComponentsTable,
} from "@workspace/db";

const STARTER_PACK_TEMPLATES = [
  {
    name: "Gate Frame",
    parts: [
      { name: "Vertical Posts", procs: [
        { name: "Cut to length" },
        { name: "Drill hinge holes" },
        { name: "Weld end caps" },
      ]},
      { name: "Horizontal Rails", procs: [
        { name: "Cut to length" },
        { name: "Mitre corners" },
        { name: "Weld to posts" },
      ]},
    ],
    topProcs: [
      { name: "Square & tack frame" },
      { name: "Full weld" },
      { name: "Grind & clean welds" },
      { name: "Sandblast" },
      { name: "Prime & paint" },
    ],
  },
  {
    name: "Panel / Cover",
    parts: [
      { name: "Face Panel", procs: [
        { name: "Laser cut profile" },
        { name: "Punch apertures" },
        { name: "Deburr edges" },
        { name: "Form flanges" },
      ]},
    ],
    topProcs: [
      { name: "Install inserts / hardware" },
      { name: "Powder coat" },
      { name: "Final inspection" },
    ],
  },
  {
    name: "Bracket Assembly",
    parts: [
      { name: "Gusset Plate", procs: [
        { name: "Plasma cut" },
        { name: "Drill mounting holes" },
        { name: "Grind edges" },
      ]},
      { name: "Bracket Body", procs: [
        { name: "Cut to size" },
        { name: "Weld gusset" },
        { name: "Grind flush" },
      ]},
    ],
    topProcs: [
      { name: "Tack & check alignment" },
      { name: "Full weld" },
      { name: "Sandblast" },
      { name: "Prime" },
    ],
  },
  {
    name: "Simple Weld Job",
    parts: [],
    topProcs: [
      { name: "Material prep / cut" },
      { name: "Fit up & clamp" },
      { name: "Tack weld" },
      { name: "Full weld" },
      { name: "Grind & clean" },
      { name: "Visual inspection" },
    ],
  },
  {
    name: "Machined + Welded Assembly",
    parts: [
      { name: "Machined Housing", procs: [
        { name: "Program setup" },
        { name: "CNC machine" },
        { name: "Deburr & inspect" },
        { name: "CMM check" },
      ]},
      { name: "Weld Bracket", procs: [
        { name: "Cut & prep" },
        { name: "Weld to housing" },
        { name: "Grind flush" },
      ]},
    ],
    topProcs: [
      { name: "Sub-assembly fit check" },
      { name: "Final weld" },
      { name: "Sandblast" },
      { name: "Paint" },
      { name: "Final dimensional check" },
    ],
  },
  {
    name: "Sheet Metal Enclosure",
    parts: [
      { name: "Enclosure Shell", procs: [
        { name: "Laser cut blank" },
        { name: "Punch holes & knockouts" },
        { name: "Press brake form" },
        { name: "Weld corners" },
        { name: "Grind welds" },
      ]},
      { name: "Door / Lid", procs: [
        { name: "Cut to size" },
        { name: "Form flanges" },
        { name: "Drill hinge holes" },
      ]},
    ],
    topProcs: [
      { name: "Fit & align door" },
      { name: "Install hardware (hinges, latches)" },
      { name: "Sandblast" },
      { name: "Powder coat" },
      { name: "Final assembly & inspection" },
    ],
  },
];

export const STARTER_PACK_COUNT = STARTER_PACK_TEMPLATES.length;

export async function seedStarterPack(companyId: number): Promise<number> {
  for (const tmpl of STARTER_PACK_TEMPLATES) {
    const [product] = await db.insert(productsTable).values({
      name: tmpl.name, category: "Template", itemType: "final_product",
      bufferStock: 0, targetStock: 0, companyId,
    }).returning();

    const [template] = await db.insert(workTemplatesTable).values({
      name: tmpl.name, companyId, productId: product.id,
    }).returning();

    // Top-level steps (templateComponentId = null)
    for (let i = 0; i < tmpl.topProcs.length; i++) {
      await db.insert(workStepsTable).values({
        templateId: template.id, name: tmpl.topProcs[i].name, sortOrder: i,
        templateComponentId: null, roleId: null, batchMode: "individual",
      });
    }

    // BOM components — steps go into work_steps with templateComponentId
    for (let partIdx = 0; partIdx < tmpl.parts.length; partIdx++) {
      const part = tmpl.parts[partIdx];

      const [partProduct] = await db.insert(productsTable).values({
        name: part.name, category: "Component", itemType: "manufactured_part",
        bufferStock: 0, targetStock: 0, companyId,
      }).returning();

      // Insert BOM entry and capture its id (this is templateComponentId)
      const [comp] = await db.insert(productComponentsTable).values({
        parentProductId: product.id, componentProductId: partProduct.id,
        quantity: 1, sortOrder: partIdx,
      }).returning();

      // Insert component steps into work_steps (NOT product_procedures)
      for (let j = 0; j < part.procs.length; j++) {
        await db.insert(workStepsTable).values({
          templateId: template.id,
          templateComponentId: comp.id,
          name: part.procs[j].name,
          sortOrder: j,
          roleId: null,
          batchMode: "individual",
        });
      }
    }
  }
  return STARTER_PACK_TEMPLATES.length;
}
