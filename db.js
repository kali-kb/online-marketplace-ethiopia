import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, serial, varchar, text, integer, timestamp } from 'drizzle-orm/pg-core';
import pkg from 'pg';
const { Pool } = pkg;
import * as dotenv from 'dotenv'; 
dotenv.config();

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: true
});

export const db = drizzle(pool);



