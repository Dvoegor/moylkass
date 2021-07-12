const knex = require('knex')({
  client: 'pg',
  connection: {
    user: 'grigorijdvoeglazov',
    host: 'localhost',
    database: 'grigorijdvoeglazov',
    password: '',
    port: 5432,
  },
});

module.exports = knex;
