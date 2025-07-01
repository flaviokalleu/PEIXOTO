'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Corrige a coluna id para ser autoincrement, primary key e not null sem remover/adicionar
    // Funciona para PostgreSQL
    // 1. Garante que existe uma sequence para o id
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'messages_id_seq') THEN
          CREATE SEQUENCE messages_id_seq;
        END IF;
      END$$;
    `);

    // 2. Altera a coluna id para usar a sequence como default
    await queryInterface.sequelize.query(`
      ALTER TABLE "Messages"
      ALTER COLUMN id SET DEFAULT nextval('messages_id_seq'),
      ALTER COLUMN id SET NOT NULL;
    `);

    // 3. Garante que a sequence está correta
    await queryInterface.sequelize.query(`
      SELECT setval('messages_id_seq', COALESCE((SELECT MAX(id) FROM "Messages"), 1));
    `);

    // 4. Garante que id é PRIMARY KEY
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'Messages' AND constraint_type = 'PRIMARY KEY'
        ) THEN
          ALTER TABLE "Messages" ADD PRIMARY KEY (id);
        END IF;
      END$$;
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Não recomendado reverter para não-autoincremento
  }
};
