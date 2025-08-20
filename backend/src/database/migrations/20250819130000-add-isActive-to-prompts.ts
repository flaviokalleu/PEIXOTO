'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Verificar se a coluna já existe
      const tableDescription = await queryInterface.describeTable('Prompts');
      
      if (!tableDescription.isActive) {
        await queryInterface.addColumn('Prompts', 'isActive', {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
        });
        console.log('✅ Column isActive added to Prompts table');
      } else {
        console.log('⚠️ Column isActive already exists in Prompts table');
      }
      
      // Também permitir null na coluna apiKey
      await queryInterface.changeColumn('Prompts', 'apiKey', {
        type: Sequelize.TEXT,
        allowNull: true
      });
      console.log('✅ Column apiKey updated to allow null');
      
    } catch (error) {
      console.error('Error in migration:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.removeColumn('Prompts', 'isActive');
      console.log('✅ Column isActive removed from Prompts table');
    } catch (error) {
      console.error('Error removing isActive column:', error);
    }
  }
};
