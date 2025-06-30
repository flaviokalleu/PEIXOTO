"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(
      "CompaniesSettings", // name of the table
      "hubToken", // name of the new column
      {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Token do Hub NotificaMe"
      }
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("CompaniesSettings", "hubToken");
  }
};
