const { Telegraf } = require('telegraf');
const { handleBotCommand } = require('./hitam');

const bot = new Telegraf('7386887141:AAEcu-SyT0_dJljHKRUx0Es3SPdRiDEqgGs');

bot.command(/(hitam|stop|stats|help)/, async (ctx) => {
    const [command, ...args] = ctx.message.text.split(' ');
    const response = await handleBotCommand(command, args, ctx.from.id);
    await ctx.reply(response, { parse_mode: 'Markdown' });
});

bot.launch();