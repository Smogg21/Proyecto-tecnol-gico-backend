const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
require('dotenv').config();


const app = express();
app.use(cors()); // Permitir solicitudes desde el frontend de React
app.use(express.json()); // Analizar solicitudes JSON entrantes

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER, // Por ejemplo: 'localhost'
  database: process.env.DB_DATABASE,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true', // Convertir a booleano
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true', // Convertir a booleano
  },
};


// Endpoint para obtener productos
app.get('/api/productos', async (req, res) => {
  try {
    let pool = await sql.connect(config);
    let result = await pool.request().query("SELECT * FROM Productos");
    res.json(result.recordset);
  } catch (err) {
    console.error('SQL error', err);
    res.status(500).send('Error del servidor');
  }
});

app.post('/api/productos', async (req, res) => {
  try {
    const { Nombre, Descripcion, IdCategoria, StockMinimo, StockMaximo } = req.body;

    // Validaciones básicas
    if (!Nombre || !IdCategoria || StockMinimo === undefined || StockMaximo === undefined) {
      return res.status(400).json({ message: 'Los campos "Nombre", "IdCategoria", "StockMinimo" y "StockMaximo" son obligatorios.' });
    }

    // Validar tipos y valores
    if (typeof Nombre !== 'string' || Nombre.trim() === '') {
      return res.status(400).json({ message: 'El campo "Nombre" debe ser una cadena de texto no vacía.' });
    }

    if (Descripcion && typeof Descripcion !== 'string') {
      return res.status(400).json({ message: 'El campo "Descripcion" debe ser una cadena de texto.' });
    }

    const stockMinimoInt = parseInt(StockMinimo, 10);
    const stockMaximoInt = parseInt(StockMaximo, 10);

    if (isNaN(stockMinimoInt) || stockMinimoInt < 0) {
      return res.status(400).json({ message: 'El campo "StockMinimo" debe ser un número entero no negativo.' });
    }

    if (isNaN(stockMaximoInt) || stockMaximoInt < stockMinimoInt) {
      return res.status(400).json({ message: 'El campo "StockMaximo" debe ser un número entero mayor o igual a "StockMinimo".' });
    }

    let pool = await sql.connect(config);

    // Consulta INSERT con parámetros para prevenir inyección SQL
    const insertQuery = `
      INSERT INTO Productos (Nombre, Descripcion, IdCategoria, StockMinimo, StockMaximo)
      VALUES (@Nombre, @Descripcion, @IdCategoria, @StockMinimo, @StockMaximo)
      SELECT SCOPE_IDENTITY() AS IdProducto
    `;

    let request = pool.request();
    request.input('Nombre', sql.NVarChar(100), Nombre);
    request.input('Descripcion', sql.NVarChar(255), Descripcion || null);
    request.input('IdCategoria', sql.Int, IdCategoria);
    request.input('StockMinimo', sql.Int, stockMinimoInt);
    request.input('StockMaximo', sql.Int, stockMaximoInt);

    let result = await request.query(insertQuery);

    // Enviar de vuelta el IdProducto creado
    res.status(201).json({ IdProducto: result.recordset[0].IdProducto });
  } catch (err) {
    console.error('SQL error', err);
    res.status(500).send('Error del servidor');
  }
});


app.get('/api/categorias', async (req, res) => {
  try {
    let pool = await sql.connect(config);
    let result = await pool.request().query("SELECT * FROM Categorias");
    res.json(result.recordset);
  } catch (err) {
    console.error('SQL error', err);
    res.status(500).send('Error del servidor');
  }
});
app.get('/api/movimientosInventario', async (req, res) => {
  try {
    let pool = await sql.connect(config);
    let result = await pool.request().query("SELECT * FROM vw_Movimientos");
    res.json(result.recordset);
  } catch (err) {
    console.error('SQL error', err);
    res.status(500).send('Error del servidor');
  }
});
// Endpoint para obtener lotes
app.get('/api/lotes', async (req, res) => {
  try {
    let pool = await sql.connect(config);
    let result = await pool.request().query("SELECT * FROM vw_Lotes");
    res.json(result.recordset);
  } catch (err) {
    console.error('SQL error', err);
    res.status(500).send('Error del servidor');
  }
});

// **Nuevo Endpoint para Insertar un Lote**
app.post('/api/lotes', async (req, res) => {
  try {
    const { producto, fechaCaducidad, fechaEntrada, cantidad, notas, idUsuario } = req.body;

    // Validaciones básicas
    if (!producto || !cantidad) {
      return res.status(400).json({ message: 'Los campos "producto" y "cantidad" son obligatorios.' });
    }

    // Convertir cantidad a número entero
    const cantidadInt = parseInt(cantidad, 10);
    if (isNaN(cantidadInt) || cantidadInt < 0) {
      return res.status(400).json({ message: 'La cantidad debe ser un número entero positivo.' });
    }

    // Conectar a la base de datos
    let pool = await sql.connect(config);

    // Consulta INSERT con parámetros para prevenir inyección SQL
    const insertQuery = `
      INSERT INTO Lotes (IdProducto, FechaCaducidad, FechaEntrada, CantidadInicial, CantidadActual, Notas, IdUsuario)
      VALUES (@IdProducto, @FechaCaducidad, @FechaEntrada, @CantidadInicial, @CantidadActual, @Notas, @IdUsuario)
      SELECT SCOPE_IDENTITY() AS IdLote
    `;

    let request = pool.request();
    request.input('IdProducto', sql.Int, producto);
    request.input('FechaCaducidad', sql.Date, fechaCaducidad || null);
    request.input('FechaEntrada', sql.DateTime, fechaEntrada ? new Date(fechaEntrada) : new Date());
    request.input('CantidadInicial', sql.Int, cantidadInt);
    request.input('CantidadActual', sql.Int, cantidadInt); // CantidadActual igual a CantidadInicial
    request.input('Notas', sql.NVarChar(255), notas || null);
    request.input('IdUsuario', sql.Int, idUsuario);

    let result = await request.query(insertQuery);

    // Enviar de vuelta el IdLote creado
    res.status(201).json({ IdLote: result.recordset[0].IdLote });
  } catch (err) {
    console.error('SQL error', err);
    res.status(500).send('Error del servidor');
  }
});

// Endpoint para registrar un movimiento de inventario
app.post('/api/movimientos', async (req, res) => {
  try {
    const { IdLote, TipoMovimiento, Cantidad, Notas, IdUsuario } = req.body;

    // Validaciones básicas
    if (!IdLote || !TipoMovimiento || !Cantidad || !IdUsuario) {
      return res.status(400).json({ message: 'Los campos "IdLote", "TipoMovimiento", "Cantidad" e "IdUsuario" son obligatorios.' });
    }

    // Validar TipoMovimiento
    if (TipoMovimiento !== 'Entrada' && TipoMovimiento !== 'Salida') {
      return res.status(400).json({ message: 'El campo "TipoMovimiento" debe ser "Entrada" o "Salida".' });
    }

    // Validar Cantidad
    const cantidadInt = parseInt(Cantidad, 10);
    if (isNaN(cantidadInt) || cantidadInt <= 0) {
      return res.status(400).json({ message: 'El campo "Cantidad" debe ser un número entero positivo.' });
    }

    let pool = await sql.connect(config);

    // Verificar si el IdLote existe
    let loteResult = await pool.request()
      .input('IdLote', sql.Int, IdLote)
      .query('SELECT * FROM Lotes WHERE IdLote = @IdLote');

    if (loteResult.recordset.length === 0) {
      return res.status(404).json({ message: 'El lote especificado no existe.' });
    }

    // Insertar el movimiento
    const insertQuery = `
      INSERT INTO MovimientosInventario (IdLote, TipoMovimiento, Cantidad, Notas, IdUsuario)
      VALUES (@IdLote, @TipoMovimiento, @Cantidad, @Notas, @IdUsuario)
      SELECT SCOPE_IDENTITY() AS IdMovimiento
    `;

    let request = pool.request();
    request.input('IdLote', sql.Int, IdLote);
    request.input('TipoMovimiento', sql.NVarChar(10), TipoMovimiento);
    request.input('Cantidad', sql.Int, cantidadInt);
    request.input('Notas', sql.NVarChar(255), Notas || null);
    request.input('IdUsuario', sql.Int, IdUsuario);

    let result = await request.query(insertQuery);

    res.status(201).json({ IdMovimiento: result.recordset[0].IdMovimiento });
  } catch (err) {
    console.error('SQL error', err);
    if (err.originalError && err.originalError.info && err.originalError.info.number === 50000) {
      // Error personalizado desde SQL Server
      return res.status(400).json({ message: err.originalError.info.message });
    }
    res.status(500).send('Error del servidor');
  }
});


// Endpoint de inicio de sesión
app.post('/api/login', async (req, res) => {
  try {
    const { Usuario, Contraseña } = req.body;

    // Validar entrada
    if (!Usuario || !Contraseña) {
      return res.status(400).json({ message: 'El nombre de usuario y la contraseña son obligatorios.' });
    }

    let pool = await sql.connect(config);
    let request = pool.request();

    request.input('Usuario', sql.NVarChar(50), Usuario);

    // Obtener Usuario por usuario
    let result = await request.query('SELECT * FROM Usuarios WHERE Usuario = @Usuario');

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const user = result.recordset[0];

    // Comparar contraseñas
    const match = await bcrypt.compare(Contraseña, user.Contraseña);

    if (!match) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    // Generar token JWT
    const token = jwt.sign(
      { IdUsuario: user.IdUsuario, Usuario: user.Usuario, IdRol: user.IdRol },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ token });
  } catch (err) {
    console.error('Error en login', err);
    res.status(500).send('Error del servidor');
  }
});

// Endpoint para restablecer contraseña
app.post('/api/restablecerPassword', async (req, res) => {
  try {
    const { Usuario, NuevaContraseña } = req.body;

    // Validar entrada
    if (!Usuario || !NuevaContraseña) {
      return res.status(400).json({ message: 'El nombre de usuario y la nueva contraseña son obligatorios.' });
    }

    let pool = await sql.connect(config);
    let request = pool.request();

    request.input('Usuario', sql.NVarChar(50), Usuario);

    // Verificar si el usuario existe
    let result = await request.query('SELECT * FROM Usuarios WHERE Usuario = @Usuario');

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'El usuario especificado no existe.' });
    }


    // Hash de la nueva contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(NuevaContraseña, saltRounds);

    // Actualizar la contraseña en la base de datos
    await pool.request()
      .input('Contraseña', sql.NVarChar(255), hashedPassword)
      .input('Usuario', sql.NVarChar(50), Usuario)
      .query('UPDATE Usuarios SET Contraseña = @Contraseña WHERE Usuario = @Usuario');

    res.json({ message: 'Contraseña restablecida correctamente.' });

  } catch (err) {
    console.error('Error al restablecer la contraseña', err);
    res.status(500).send('Error del servidor');
  }
});




// Middleware de autenticación
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Formato: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ message: 'Token no proporcionado.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token inválido.' });
    }
    req.user = user;
    next();
  });
}


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
