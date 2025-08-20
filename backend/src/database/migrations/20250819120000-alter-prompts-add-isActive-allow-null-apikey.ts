import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Alter apiKey to allow null
    try {
      await queryInterface.changeColumn("Prompts", "apiKey", {
        type: DataTypes.TEXT,
        allowNull: true
      });
      console.log("✅ Updated Prompts.apiKey to allow null");
    } catch (err) {
      console.error("Failed to alter Prompts.apiKey to allow null:", err);
    }

    // Add isActive column if it does not exist
    try {
      const table: any = await queryInterface.describeTable("Prompts");
      if (!table["isActive"]) {
        await queryInterface.addColumn("Prompts", "isActive", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true
        });
        console.log("✅ Added Prompts.isActive column");
      } else {
        console.log("⚠️ Prompts.isActive column already exists, skipping");
      }
    } catch (err) {
      console.error("Failed to add Prompts.isActive column:", err);
    }
  },
  down: async (queryInterface: QueryInterface) => {
    // Remove isActive column
    try {
      await queryInterface.removeColumn("Prompts", "isActive");
    } catch (err) {
      console.error("Failed to remove Prompts.isActive column:", err);
    }

    // Revert apiKey allowNull change (may fail if nulls exist)
    try {
      await queryInterface.changeColumn("Prompts", "apiKey", {
        type: DataTypes.TEXT,
        allowNull: false
      });
    } catch (err) {
      console.error("Failed to revert Prompts.apiKey allowNull change:", err);
    }
  }
};
