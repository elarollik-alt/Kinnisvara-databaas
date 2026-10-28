-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "county" TEXT NOT NULL,
    "size_range" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "avg_area" DOUBLE PRECISION,
    "sum_total" DOUBLE PRECISION,
    "sum_min" DOUBLE PRECISION,
    "sum_max" DOUBLE PRECISION,
    "unit_min" DOUBLE PRECISION,
    "unit_max" DOUBLE PRECISION,
    "unit_median" DOUBLE PRECISION,
    "unit_mean" DOUBLE PRECISION,
    "unit_std" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_county_size_range_key" ON "transactions"("county", "size_range");

