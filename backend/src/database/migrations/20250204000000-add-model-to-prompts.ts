import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      const table: any = await queryInterface.describeTable("Prompts");
      if (!table["model"]) {
        await queryInterface.addColumn("Prompts", "model", {
          type: DataTypes.STRING,
            allowNull: false,
            defaultValue: "gpt-3.5-turbo-1106"
        });
        console.log("✅ Added Prompts.model column");
      } else {
        console.log("⚠️ Prompts.model already exists, skipping");
      }
    } catch (error) {
      console.error("Failed in add-model-to-prompts migration:", error);
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface) => {
    try {
      const table: any = await queryInterface.describeTable("Prompts");
      if (table["model"]) {
        await queryInterface.removeColumn("Prompts", "model");
        console.log("✅ Removed Prompts.model column");
      }
    } catch (error) {
      console.error("Failed to rollback add-model-to-prompts migration:", error);
      throw error;
    }
  }
};
