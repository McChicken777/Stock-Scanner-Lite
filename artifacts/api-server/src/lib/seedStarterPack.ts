import {
  db, workTemplatesTable, workStepsTable,
  productsTable, productComponentsTable, productProceduresTable,
} from "@workspace/db";

const STARTER_PACK_TEMPLATES = [
  {
    name: "Welded Frame",
    parts: [
      { name: "Main Frame Rails", procs: [
        { name: "Cut to length" },
        { name: "Weld assembly" },
        { name: "Grind welds" },
      ]},
    ],
    topProcs: [
      { name: "Sandblast" },
      { name: "Prime & paint" },
    ],
  },
  {
    name: "CNC Machined Part",
    parts: [
      { name: "CNC Body", procs: [
        { name: "Program setup" },
        { name: "CNC machine" },
        { name: "Deburr & inspect" },
      ]},
    ],
    topProcs: [
      { name: "Final inspection" },
    ],
  },
  {
    name: "Sheet Metal Assembly",
    parts: [
      { name: "Sheet Metal Panel", procs: [
        { name: "Laser cut" },
        { name: "Form / press brake" },
        { name: "Hardware insert" },
      ]},
    ],
    topProcs: [
      { name: "Powder coat" },
      { name: "Final assembly" },
    ],
  },
  {
    name: "Structural Bracket",
    parts: [
      { name: "Bracket Plate", procs: [
        { name: "Cut & drill" },
        { name: "Weld gussets" },
      ]},
    ],
    topProcs: [
      { name: "Sandblast" },
      { name: "Prime" },
    ],
  },
  {
    name: "Pipe / Tube Assembly",
    parts: [
      { name: "Tube Sections", procs: [
        { name: "Cut to spec" },
        { name: "End prep / bevel" },
        { name: "Weld joints" },
        { name: "Pressure test" },
      ]},
    ],
    topProcs: [
      { name: "Coating / galvanise" },
    ],
  },
  {
    name: "Custom Enclosure",
    parts: [
      { name: "Enclosure Shell", procs: [
        { name: "Cut sheet" },
        { name: "Punch holes" },
        { name: "Fold / form" },
        { name: "Weld corners" },
      ]},
    ],
    topProcs: [
      { name: "Sandblast" },
      { name: "Paint" },
      { name: "Install hardware" },
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

    for (let i = 0; i < tmpl.topProcs.length; i++) {
      await db.insert(workStepsTable).values({
        templateId: template.id, name: tmpl.topProcs[i].name, sortOrder: i,
        roleId: null, batchMode: "individual",
      });
    }

    for (const part of tmpl.parts) {
      const [partProduct] = await db.insert(productsTable).values({
        name: part.name, category: "Component", itemType: "manufactured_part",
        bufferStock: 0, targetStock: 0, companyId,
      }).returning();

      await db.insert(productComponentsTable).values({
        parentProductId: product.id, componentProductId: partProduct.id, quantity: 1, sortOrder: 0,
      });

      for (let j = 0; j < part.procs.length; j++) {
        await db.insert(productProceduresTable).values({
          productId: partProduct.id, name: part.procs[j].name, sortOrder: j, roleId: null, batchMode: "individual",
        });
      }
    }
  }
  return STARTER_PACK_TEMPLATES.length;
}
