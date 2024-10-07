const express = require('express');
const sql = require('mssql');
const cors = require('cors');
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
    const { producto, fechaCaducidad, fechaEntrada, cantidad, notas } = req.body;

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
      INSERT INTO Lotes (IdProducto, FechaCaducidad, FechaEntrada, CantidadInicial, CantidadActual, Notas)
      VALUES (@IdProducto, @FechaCaducidad, @FechaEntrada, @CantidadInicial, @CantidadActual, @Notas)
      SELECT SCOPE_IDENTITY() AS IdLote
    `;

    let request = pool.request();
    request.input('IdProducto', sql.Int, producto);
    request.input('FechaCaducidad', sql.Date, fechaCaducidad || null);
    request.input('FechaEntrada', sql.DateTime, fechaEntrada ? new Date(fechaEntrada) : new Date());
    request.input('CantidadInicial', sql.Int, cantidadInt);
    request.input('CantidadActual', sql.Int, cantidadInt); // CantidadActual igual a CantidadInicial
    request.input('Notas', sql.NVarChar(255), notas || null);

    let result = await request.query(insertQuery);

    // Enviar de vuelta el IdLote creado
    res.status(201).json({ IdLote: result.recordset[0].IdLote });
  } catch (err) {
    console.error('SQL error', err);
    res.status(500).send('Error del servidor');
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
