import { prisma } from "@/lib/prisma";
import { AdminAddOnsClient } from "./add-ons-client";

export const dynamic = "force-dynamic";

export default async function AdminAddOnsPage() {
  const addOns = await prisma.addOn.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return (
    <AdminAddOnsClient
      initialAddOns={addOns.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      }))}
    />
  );
}
