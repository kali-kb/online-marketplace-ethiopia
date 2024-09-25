import { Telegraf, Markup, session } from "telegraf"
import { db } from "./db.js"
import { eq, sql } from "drizzle-orm"
import { user, category, product } from "./schema.js"
import uploadFile from "./s3uploader.js"
import * as dotenv from 'dotenv'
import express from 'express';
dotenv.config()


const app = express()

const bot = new Telegraf(process.env.BOT_TOKEN)

bot.use(session())


bot.use((ctx, next) => {
  if (!ctx.session) {
    ctx.session = {};
    console.log('Session initialized');
  }
  if (!ctx.session.formData) {
    ctx.session.formData = {};
    console.log('Form data initialized');
  }
  return next();
});


const authMiddleware = async(ctx, next) => {
  console.log("auth executed")
  if (!ctx.userData) {
    const userObj = await getUser(ctx.from.id)
    if(!userObj) {
      ctx.session.authState = 'awaitingContact'
      await ctx.reply("Please send your contact information", Markup.keyboard([
        [Markup.button.contactRequest("Send Contact")]
      ]).resize())
      return
    } else {
      ctx.userData = {userId: userObj.id}
    }
  }
  return next()
}
////////// seller form ////////////
bot.on('contact', async (ctx) => {
  if (ctx.session.authState === 'awaitingContact') {
    const contact = ctx.message.contact
    ctx.session.tempUserData = {
      telegramId: contact.user_id.toString(),
      contact: contact.phone_number
    }
    ctx.session.authState = 'awaitingLocation'
    await ctx.reply("Thank you. Now please send your location.", Markup.keyboard([
      [Markup.button.locationRequest("Send Location")]
    ]).resize())
  }
})

bot.on('location', async (ctx) => {
  // console.log(ctx.message.location)
  if (ctx.session.authState === 'awaitingLocation') {
    const location = ctx.message.location
    const locationString = `(${location.longitude},${location.latitude})`
    try {
      const newUser = await db.insert(user).values({
        ...ctx.session.tempUserData,
        location: {x: location.longitude, y: location.latitude}
      }).returning()

      ctx.userData = { userId: newUser[0].id }
      delete ctx.session.authState
      delete ctx.session.tempUserData
      await ctx.reply("Thank you for providing your information. You can now use the bot.", Markup.removeKeyboard())
    } catch (error) {
      console.error("Error creating user:", error)
      await ctx.reply("There was an error processing your information. Please try again later.")
    }
  }
})
////////// seller form ////////////


const getUser = async (tgUserId) => {
  const result = await db.select().from(user).where(eq(user.telegramId, tgUserId.toString()))
  return result[0] || null
}

const getCategories = async () => await db.select().from(category)

const getProducts = async (userId) => await db.select().from(product).where(eq(product.seller, userId)).leftJoin(user, eq(product.seller, user.id)).limit(10);
// const getProducts = async (userId) => await db.select().from(product).where(eq(product.seller, userId.toString())).leftJoin(user, eq(product.seller, user.id));

const deleteProduct = async (productId) => await db.delete(product).where(eq(product.id, productId))

const insertProduct = async (formData) => await db.insert(product).values(formData)

const getProductById = async (productId) => await db.select().from(product).where(eq(product.id, productId)).first()

//////////// commands ///////////////
bot.command('start', (ctx) => {
  if(ctx.session.formState) { ctx.session.formState = null }
  ctx.reply('Welcome 👋, what do you want to do?', Markup.keyboard([
    ['Add Product', 'My Products'],
  ]).resize())
})

bot.command('cancel', (ctx) => {
  ctx.session.formState = null
  ctx.reply('Form Cancelled', Markup.keyboard([
    ['Add Product', 'My Products']
  ]).resize())
})
//////////// commands ///////////////



//////////// actions ///////////////
bot.action('add_product', async (ctx) => {
  console.log('add_product action triggered');
  try {
    ctx.session.formState = 'name';
    ctx.session.formData = {};
    await ctx.reply("What is the name of the product?, or use /cancel to quit the form", Markup.removeKeyboard());
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error in add_product action:', error);
  }
})

bot.action(/^delete:(\d+)$/, async (ctx) => {
  console.log("product deletion executed")
  const productId = ctx.match[1]
  if (!ctx.session.deletingProductId) {
    ctx.session.deletingProductId = productId
    await ctx.editMessageText("Are you sure you want to delete?")
    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        [Markup.button.callback("Yes", "confirm_delete"),Markup.button.callback("No", "cancel_delete")],
      ]
    })
  } else {
    ctx.answerCbQuery("You can only perform operation on one product at a time")
  }
})

bot.action('confirm_delete', async (ctx) => {
  const productId = ctx.session.deletingProductId
  if (productId) {
    try {
      await deleteProduct(productId)
      await ctx.answerCbQuery("Product deleted successfully")
      await ctx.deleteMessage()
    } catch (error) {
      console.error("Error deleting product:", error)
      await ctx.answerCbQuery("Failed to delete product")
    }
  }
  delete ctx.session.deletingProductId
})

bot.action('cancel_delete', async (ctx) => {
  const productId = ctx.session.deletingProductId;
  if (productId && ctx.session.productDetails[productId]) {
    try {
      const { name, price, description, seller } = ctx.session.productDetails[productId];
      const message = `Product: ${name}\nPrice: ${price}\nDescription: ${description}\nSeller: ${seller}\n`;
      await ctx.editMessageText(message);
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [[Markup.button.callback("Delete", `delete:${productId}`)]],
      });
    } catch (error) {
      console.error("Error restoring product message:", error);
      await ctx.answerCbQuery("Failed to restore product message");
    }
  }
  delete ctx.session.deletingProductId;
});

bot.action('save_product', authMiddleware, async (ctx) => {
  console.log("executed save_product")
  const { formData } = ctx.session
  const productData = {
    ...formData,
    seller: ctx.userData.userId,
  }
  try {
    await insertProduct(productData)
    await ctx.answerCbQuery("Product Created Successfully")
    await ctx.editMessageText("Product has been saved. Use /start to return to the main menu.")
  } catch (error) {
    console.error("Error creating product:", error)
    await ctx.answerCbQuery("Failed to create product")
  }
  ctx.session.formState = null
  ctx.session.formData = {}
})

bot.action('cancel_product', async (ctx) => {
  ctx.session.formState = null
  ctx.session.formData = {}
  await ctx.answerCbQuery("Product creation cancelled")
  await ctx.editMessageText("Product creation has been cancelled. Use /start to return to the main menu.")
})


//////////// actions ///////////////

bot.on('text', authMiddleware, async (ctx) => {
  const { text } = ctx.message
  const { formState, formData } = ctx.session

  if (!formState) {
    switch (text) {
      case "Add Product":
        const message = "For posting your product, We require information below \n • Name for your product\n • Price\n • Description(optional)\n • Category\n • Condition\n • Product Images\n\n"
        await ctx.replyWithHTML(message, Markup.inlineKeyboard([
          [Markup.button.callback("Proceed to Form", "add_product")]
        ]))
        break
      case "My Products":
        await ctx.reply("--- All Products ---")
        const products = await getProducts(ctx.userData.userId)
        if (products.length == 0) {
          ctx.reply("No posted products");
        } else {
          ctx.session.productDetails = {}; // Initialize the object
          for (const item of products) {
            const { product, user } = item;
            const message = `Product: ${product.name}\nPrice: ${product.price}\nDescription: ${product.description}\nSeller: @${ctx.from.username}\n`;
            ctx.session.productDetails[product.id] = {
              id: product.id,
              name: product.name,
              price: product.price,
              description: product.description,
              seller: user.contact,
            };
            await ctx.reply(message, Markup.inlineKeyboard([
              [Markup.button.callback("Delete", `delete:${product.id}`)],
            ]));
          }
        }
        break
    }
  } else {
    switch (formState) {
      case 'name':
        formData.name = text
        ctx.session.formState = 'price'
        await ctx.reply("What is the Price in ETB?, or use /cancel to quit the form")
        break
      case 'price':
        formData.price = text.replace(/,/g, '');
        ctx.session.formState = 'description'
        await ctx.reply("Write Description for the product, or send /skip to leave it empty or use /cancel to quit the form")
        break
      case 'description':
        formData.description = text === '/skip' ? '' : text
        ctx.session.formState = 'condition'
        const condition_option_btns = [Markup.button.callback("New"), Markup.button.callback("Used")]
        ctx.reply("What is the condition of product?", Markup.keyboard(condition_option_btns).oneTime().resize())
        break
      case 'condition':
        formData.condition = text.toLowerCase()
        ctx.session.formState = 'category'
        const categories = await getCategories()
        console.log(categories)
        const buttons = categories.map(cat => [Markup.button.callback(cat.name, `category:${cat.id}`)])
        await ctx.reply("Choose Category, or use /cancel to quit the form", Markup.keyboard(buttons).oneTime().resize())
        break
      case 'category':
        const categoryId = (await getCategories()).find(cat => cat.name === text)?.id
        if (categoryId) {
          formData.categoryId = categoryId
          formData.category = text
          ctx.session.formState = 'images'
          await ctx.reply("Please send up to 5 images of your product. When you're done, send /done or /skip if you don't want to add images.")
        } else {
          await ctx.reply("Invalid category. Please choose from the provided options.")
        }
        break
      case 'images':
        if (text === '/done' || text === '/skip') {
          ctx.session.formState = 'confirmation'
          const confirmationMessage = `<b>Product Name:</b> ${formData.name}\n<b>Price:</b> ${formData.price}\n<b>Description:</b> ${formData.description || 'N/A'}\n<b>Category:</b> ${formData.category}\n<b>Condition:</b> ${formData.condition.toUpperCase()}\nIs this information correct?`
          await ctx.replyWithHTML(confirmationMessage, Markup.inlineKeyboard([
            [Markup.button.callback('Save', 'save_product')],
            [Markup.button.callback('Cancel', 'cancel_product')]
          ]))
        } else {
          await ctx.reply("Please send images, or use /done when finished or /skip to skip adding images.")
        }
        break
    }
  }
})

//////////// Image Handling ////////////////

bot.on('photo', async (ctx) => {
  if (ctx.session.formState === 'images') {
    const photo = ctx.message.photo[ctx.message.photo.length - 1]
    const fileLink = await ctx.telegram.getFileLink(photo.file_id)
    const imageUrl = await uploadFile(fileLink.href)
    if (!ctx.session.formData.images) {
      ctx.session.formData.images = []
    }
    ctx.session.formData.images.push(imageUrl)
    await ctx.reply(`Image uploaded. Send more images or use /done when finished.`)
  }
})
//////////// Image Handling ////////////////


//////////// inlinequery ///////////////
bot.on("inline_query", authMiddleware, async (ctx) => {
  const query = ctx.inlineQuery.query.toLowerCase()
  console.log("user id:", ctx.userData.userId)
  const products = await getProducts(ctx.userData.userId)
  console.log(products)
  const results = products
    .filter(product => product.product.name.toLowerCase().includes(query))
    .map(product => ({
      type: "article",
      id: product.product.id.toString(),
      title: product.product.name,
      description: `Price: ${product.product.price}\nCondition: ${product.product.condition}`,
      thumb_url: product.product.images[0],
      input_message_content: {
        message_text: `Product: ${product.product.name}\nPrice: ${product.product.price}\nCondition: ${product.product.condition}\nSeller: ${product.user.contact}`
      },
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Delete', callback_data: `delete:${product.product.name}` }],
        ]
      },
    }))
  await ctx.answerInlineQuery(results, {cache_time: 4})
})
//////////// inlinequery ///////////////





export default bot