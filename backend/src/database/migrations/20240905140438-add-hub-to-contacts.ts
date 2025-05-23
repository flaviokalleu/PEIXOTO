import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.addColumn("Contacts", "messengerId", {
        type: DataTypes.TEXT,
        allowNull: true,
      }),
      queryInterface.addColumn("Contacts", "instagramId", {
        type: DataTypes.TEXT,
        allowNull: true,
      })
    ]);
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("Contacts", "messengerId"),
      queryInterface.removeColumn("Contacts", "instagramId")
    ]);
  }
};