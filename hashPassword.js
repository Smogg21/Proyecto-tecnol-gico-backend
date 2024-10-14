// hashPassword.js
const bcrypt = require('bcrypt');

const password = 'passwordABC';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, function(err, hash) {
  if (err) {
    console.error('Error al hashear la contraseña:', err);
  } else {
    console.log('Hash generado:', hash);
  }
});
