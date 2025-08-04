import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.addColumn("Prompts", "model", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "gpt-3.5-turbo-1106"
    });
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Prompts", "model");
  }
};
