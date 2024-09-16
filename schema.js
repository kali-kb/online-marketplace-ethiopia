import { pgTable, pgSchema, serial, varchar, text, integer, timestamp, uniqueIndex, point } from 'drizzle-orm/pg-core';

export const mySchema = pgSchema("my_schema");
export const conditions = mySchema.enum('conditions', ['new', 'used']);

export const user = pgTable('user', {
    id: serial('id').primaryKey(),
    telegramId: varchar('tg_user_id').unique(),
    contact: varchar('contact'),
    location: point('location', { mode: 'xy' }).notNull(),
}, (table) => {
    return {
        telegramIdIdx: uniqueIndex('telegram_id_idx').on(table.telegramId),
        idIdx: uniqueIndex('id_idx').on(table.id),
    }
})

export const category = pgTable('category', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 256 }),
}, table => ({
    nameIndex: uniqueIndex('name_idx').on(table.name),
}))

export const product = pgTable('product', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 256 }),
    price: varchar('price', { length: 256 }),
    seller: integer('seller_id').references(() => user.id, { onDelete: 'cascade' }).notNull(),
    condition: conditions('condition').default("new"),
    images: text('image_urls').array(),
    description: text('description'),
    categoryId: integer('category_id').references(() => category.id, { onDelete: 'set null' }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow(),
}, table => ({
    nameIndex: uniqueIndex('product_name_idx').on(table.name),
}));

