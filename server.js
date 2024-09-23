import express from 'express';
import { db } from './db.js';
import cors from 'cors';
import { product, category, user } from './schema.js';
import { eq, sql } from 'drizzle-orm';
import bot from "./bot.js"


const app = express();
const port = process.env.PORT || 3000;

const corsOptions = {
  origin: "*",
  credentials: true
};

app.use(cors(corsOptions));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});



app.use(express.json());

// Enable CORS for all domains


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});



app.get('/', async(req,res) => {
  res.json({message: "Hello World"})
})

// Fetch list of products
app.get('/products', async (req, res) => {
  try {
    const searchTerm = req.query.search;
    let products;
    if (searchTerm) {
      products = await db
        .select()
        .from(product)
        .leftJoin(user, eq(product.seller, user.id))
        .where(sql`${product.name} LIKE ${`%${searchTerm}%`}`);
    } else {
      products = await db
        .select()
        .from(product)
        .leftJoin(user, eq(product.seller, user.id));
    }
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch products by category
app.get('/categories/:id/products', async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id);
    const products = await db.select()
      .from(product)
      .where(eq(product.categoryId, categoryId))
      .leftJoin(user, eq(product.seller, user.id));
    
    if (products.length === 0) {
      res.status(404).json({ error: 'No products found for this category' });
    } else {
      res.json(products);
    }
  } catch (error) {
    console.error('Error fetching products by category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Fetch a single product by id
app.get('/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const result = await db.select().from(product).where(eq(product.id, productId)).leftJoin(user, eq(product.seller, user.id));
    
    if (result.length === 0) {
      res.status(404).json({ error: 'Product not found' });
    } else {
      res.json(result[0]);
    }
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch products of a single category
app.get('/categories/:id/products', async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id);
    const products = await db.select().from(product).where(eq(product.categoryId, categoryId));
    if (products.length === 0) {
      res.status(404).json({ error: 'No products found for this category' });
    } else {
      res.json(products);
    }
  } catch (error) {
    console.error('Error fetching products by category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// Fetch list of categories
app.get('/categories', async (req, res) => {
  try {
    const categories = await db.select().from(category);
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/webhook', (req, res) => {
  bot.handleUpdate(req.body, res)
})


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
