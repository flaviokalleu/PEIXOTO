const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('unkbot', 'postgres', '99480231a', {
  host: 'localhost',
  dialect: 'postgres',
  logging: false
});

async function checkPrompts() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection successful');
    
    const [results] = await sequelize.query('SELECT id, name, prompt, model, "apiKey" FROM "Prompts" LIMIT 5;');
    
    console.log('\n📋 Current Prompts in Database:');
    results.forEach((prompt, index) => {
      console.log(`\n${index + 1}. ID: ${prompt.id}`);
      console.log(`   Name: ${prompt.name}`);
      console.log(`   Model: ${prompt.model}`);
      console.log(`   API Key: ${prompt.apiKey ? '***configured***' : 'NOT SET'}`);
      console.log(`   Prompt: ${prompt.prompt ? prompt.prompt.substring(0, 100) + '...' : 'NOT SET'}`);
    });
    
    if (results.length === 0) {
      console.log('❌ No prompts found in database');
    }
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await sequelize.close();
  }
}

checkPrompts();
