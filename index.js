const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();
app.use(cors()); // Permitir solicitudes desde el frontend de React
app.use(express.json()); // Analizar solicitudes JSON entrantes

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER, // Por ejemplo: 'localhost'
  database: process.env.DB_DATABASE,
  options: {
    encrypt: process.env.DB_ENCRYPT === "true", // Convertir a booleano
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === "true", // Convertir a booleano
  },
};

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Usuario no autenticado." });
    }

    const userRole = req.user.IdRol; // Asumiendo que IdRol está en el token

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ message: "Acceso denegado." });
    }

    next();
  };
}

// Endpoint para obtener productos
app.get("/api/productos", async (req, res) => {
  try {
    let pool = await sql.connect(config);
    let result = await pool.request().query("SELECT * FROM Productos");
    res.json(result.recordset);
  } catch (err) {
    console.error("SQL error", err);
    res.status(500).send("Error del servidor");
  }
});

app.post("/api/productos", async (req, res) => {
  try {
    const {
      Nombre,
      Descripcion,
      IdCategoria,
      StockMinimo,
      StockMaximo,
      HasNumSerie,
    } = req.body;

    // Validaciones básicas
    if (
      !Nombre ||
      !IdCategoria ||
      StockMinimo === undefined ||
      StockMaximo === undefined
    ) {
      return res
        .status(400)
        .json({
          message:
            'Los campos "Nombre", "IdCategoria", "StockMinimo" y "StockMaximo" son obligatorios.',
        });
    }

    // Validar tipos y valores
    if (typeof Nombre !== "string" || Nombre.trim() === "") {
      return res
        .status(400)
        .json({
          message: 'El campo "Nombre" debe ser una cadena de texto no vacía.',
        });
    }

    if (Descripcion && typeof Descripcion !== "string") {
      return res
        .status(400)
        .json({
          message: 'El campo "Descripcion" debe ser una cadena de texto.',
        });
    }

    const stockMinimoInt = parseInt(StockMinimo, 10);
    const stockMaximoInt = parseInt(StockMaximo, 10);

    if (isNaN(stockMinimoInt) || stockMinimoInt < 0) {
      return res
        .status(400)
        .json({
          message:
            'El campo "StockMinimo" debe ser un número entero no negativo.',
        });
    }

    if (isNaN(stockMaximoInt) || stockMaximoInt < stockMinimoInt) {
      return res
        .status(400)
        .json({
          message:
            'El campo "StockMaximo" debe ser un número entero mayor o igual a "StockMinimo".',
        });
    }

    let pool = await sql.connect(config);

    // Consulta INSERT con parámetros para prevenir inyección SQL
    const insertQuery = `
      INSERT INTO Productos (Nombre, Descripcion, IdCategoria, StockMinimo, StockMaximo, HasNumSerie)
      VALUES (@Nombre, @Descripcion, @IdCategoria, @StockMinimo, @StockMaximo, @HasNumSerie)
      SELECT SCOPE_IDENTITY() AS IdProducto
    `;

    let request = pool.request();
    request.input("Nombre", sql.NVarChar(100), Nombre);
    request.input("Descripcion", sql.NVarChar(255), Descripcion || null);
    request.input("IdCategoria", sql.Int, IdCategoria);
    request.input("StockMinimo", sql.Int, stockMinimoInt);
    request.input("StockMaximo", sql.Int, stockMaximoInt);
    request.input("HasNumSerie", sql.Bit, HasNumSerie);

    let result = await request.query(insertQuery);

    // Enviar de vuelta el IdProducto creado
    res.status(201).json({ IdProducto: result.recordset[0].IdProducto });
  } catch (err) {
    console.error("SQL error", err);
    res.status(500).send("Error del servidor");
  }
});

app.get("/api/categorias", async (req, res) => {
  try {
    let pool = await sql.connect(config);
    let result = await pool.request().query("SELECT * FROM Categorias");
    res.json(result.recordset);
  } catch (err) {
    console.error("SQL error", err);
    res.status(500).send("Error del servidor");
  }
});
app.get("/api/movimientosInventario", async (req, res) => {
  try {
    let pool = await sql.connect(config);
    let result = await pool.request().query("SELECT * FROM vw_Movimientos");
    res.json(result.recordset);
  } catch (err) {
    console.error("SQL error", err);
    res.status(500).send("Error del servidor");
  }
});
// Endpoint para obtener lotes
app.get("/api/lotes", async (req, res) => {
  try {
    let pool = await sql.connect(config);
    let result = await pool.request().query("SELECT * FROM vw_Lotes");
    res.json(result.recordset);
  } catch (err) {
    console.error("SQL error", err);
    res.status(500).send("Error del servidor");
  }
});

// Endpoint para obtener los números de serie de un lote
app.get("/api/lotes/:idLote/serial-numbers", async (req, res) => {
  const { idLote } = req.params;
  const { estado } = req.query; // Obtener el estado desde los parámetros de consulta

  try {
    let pool = await sql.connect(config);
    let request = pool.request().input("IdLote", sql.Int, idLote);

    let query = `
      SELECT NumSerie
      FROM DetalleProducto
      WHERE IdLote = @IdLote
    `;

    // Si se proporciona el estado, agregar condición al query
    if (estado) {
      query += ` AND Estado = @Estado`;
      request.input("Estado", sql.NVarChar(50), estado);
    }

    let result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error("SQL error", err);
    res.status(500).send("Error del servidor");
  }
});

// Endpoint para obtener todos los roles
app.get(
  "/api/roles",
  authenticateToken,
  authorizeRoles(1),
  async (req, res) => {
    try {
      let pool = await sql.connect(config);
      let result = await pool.request().query("SELECT * FROM Roles");
      res.json(result.recordset);
    } catch (err) {
      console.error("Error al obtener los roles", err);
      res.status(500).send("Error del servidor");
    }
  }
);

// **Nuevo Endpoint para Insertar un Lote**
app.post("/api/lotes", async (req, res) => {
  try {
    const {
      producto,
      fechaCaducidad,
      fechaEntrada,
      cantidad,
      notas,
      idUsuario,
      serialNumbers,
    } = req.body;

    // Validaciones básicas
    if (!producto || !cantidad) {
      return res
        .status(400)
        .json({
          message: 'Los campos "producto" y "cantidad" son obligatorios.',
        });
    }

    // Convertir cantidad a número entero
    const cantidadInt = parseInt(cantidad, 10);
    if (isNaN(cantidadInt) || cantidadInt <= 0) {
      return res
        .status(400)
        .json({ message: "La cantidad debe ser un número entero positivo." });
    }

    // Conectar a la base de datos
    let pool = await sql.connect(config);

    // Obtener HasNumSerie del producto
    let productResult = await pool
      .request()
      .input("IdProducto", sql.Int, producto)
      .query(
        "SELECT HasNumSerie FROM Productos WHERE IdProducto = @IdProducto"
      );

    if (productResult.recordset.length === 0) {
      return res
        .status(404)
        .json({ message: "El producto especificado no existe." });
    }

    const hasNumSerie = productResult.recordset[0].HasNumSerie;

    // Establecer CantidadActual según HasNumSerie
    const cantidadActual = 0;

    // Insertar en Lotes
    const insertLoteQuery = `
      INSERT INTO Lotes (IdProducto, FechaCaducidad, FechaEntrada, CantidadInicial, CantidadActual, Notas, IdUsuario)
      VALUES (@IdProducto, @FechaCaducidad, @FechaEntrada, @CantidadInicial, @CantidadActual, @Notas, @IdUsuario)
      SELECT SCOPE_IDENTITY() AS IdLote;
    `;

    let request = pool.request();
    request.input("IdProducto", sql.Int, producto);
    request.input("FechaCaducidad", sql.Date, fechaCaducidad || null);
    request.input(
      "FechaEntrada",
      sql.DateTime,
      fechaEntrada ? new Date(fechaEntrada) : new Date()
    );
    request.input("CantidadInicial", sql.Int, cantidadInt);
    request.input("CantidadActual", sql.Int, cantidadActual);
    request.input("Notas", sql.NVarChar(255), notas || null);
    request.input("IdUsuario", sql.Int, idUsuario);

    let result = await request.query(insertLoteQuery);

    const IdLote = result.recordset[0].IdLote;

    if (hasNumSerie && serialNumbers && serialNumbers.length > 0) {
      // Validar que la cantidad de números de serie coincide con la cantidad ingresada
      if (serialNumbers.length !== cantidadInt) {
        return res
          .status(400)
          .json({
            message:
              "La cantidad de números de serie no coincide con la cantidad ingresada.",
          });
      }

      // Insertar los números de serie en DetalleProducto
      for (let numSerie of serialNumbers) {
        await pool
          .request()
          .input("IdLote", sql.Int, IdLote)
          .input("IdProducto", sql.Int, producto)
          .input("NumSerie", sql.NVarChar(30), numSerie).query(`
            INSERT INTO DetalleProducto (IdLote, IdProducto, NumSerie)
            VALUES (@IdLote, @IdProducto, @NumSerie)
          `);
      }
    }

    // Enviar de vuelta el IdLote creado
    res.status(201).json({ IdLote });
  } catch (err) {
    console.error("SQL error", err);
    // Manejo de errores de clave duplicada (número de serie repetido)
    if (err.number === 2627 || err.number === 2601) {
      res
        .status(400)
        .json({
          message: "Uno o más números de serie ya existen en el sistema.",
        });
    } else {
      res.status(500).send("Error del servidor");
    }
  }
});

// Endpoint para registrar un movimiento de inventario
app.post("/api/movimientos", async (req, res) => {
  try {
    // Extraer campos del cuerpo de la solicitud
    const { IdLote, TipoMovimiento, Cantidad, Notas, IdUsuario, NumSerie } =
      req.body;

    // Validaciones básicas
    if (!IdLote || !TipoMovimiento || !Cantidad || !IdUsuario) {
      return res
        .status(400)
        .json({
          message:
            'Los campos "IdLote", "TipoMovimiento", "Cantidad" e "IdUsuario" son obligatorios.',
        });
    }

    // Validar TipoMovimiento
    if (TipoMovimiento !== "Entrada" && TipoMovimiento !== "Salida") {
      return res
        .status(400)
        .json({
          message: 'El campo "TipoMovimiento" debe ser "Entrada" o "Salida".',
        });
    }

    // Validar Cantidad
    const cantidadInt = parseInt(Cantidad, 10);
    if (isNaN(cantidadInt) || cantidadInt <= 0) {
      return res
        .status(400)
        .json({ message: "La cantidad debe ser un número entero positivo." });
    }

    // Conectar a la base de datos
    let pool = await sql.connect(config);

    // Obtener el lote y verificar si el producto tiene número de serie
    let loteResult = await pool.request().input("IdLote", sql.Int, IdLote)
      .query(`
        SELECT l.*, p.HasNumSerie, l.CantidadActual, l.CantidadInicial
        FROM Lotes l
        INNER JOIN Productos p ON l.IdProducto = p.IdProducto
        WHERE l.IdLote = @IdLote
      `);

    if (loteResult.recordset.length === 0) {
      return res
        .status(404)
        .json({ message: "El lote especificado no existe." });
    }

    const lote = loteResult.recordset[0];
    const hasNumSerie = lote.HasNumSerie;

    // Si el producto maneja números de serie, realizar validaciones adicionales
    if (hasNumSerie) {
      // Validar que NumSerie esté proporcionado
      if (!NumSerie) {
        return res
          .status(400)
          .json({
            message: "Debe proporcionar el número de serie para este producto.",
          });
      }

      // Dependiendo del TipoMovimiento, establecer el estado esperado
      let estadoEsperado;
      if (TipoMovimiento === "Salida") {
        estadoEsperado = "Activo";
      } else if (TipoMovimiento === "Entrada") {
        estadoEsperado = "Inactivo";
      }

      // Verificar que el número de serie exista, pertenezca al lote y tenga el estado esperado
      let serialResult = await pool
        .request()
        .input("NumSerie", sql.NVarChar(30), NumSerie)
        .input("IdLote", sql.Int, IdLote)
        .input("Estado", sql.NVarChar(50), estadoEsperado).query(`
          SELECT * FROM DetalleProducto
          WHERE NumSerie = @NumSerie AND IdLote = @IdLote AND Estado = @Estado
        `);

      if (serialResult.recordset.length === 0) {
        return res
          .status(400)
          .json({
            message: `El número de serie no está disponible para ${TipoMovimiento.toLowerCase()}.`,
          });
      }

      // Para productos con número de serie, la cantidad debe ser 1
      if (cantidadInt !== 1) {
        return res
          .status(400)
          .json({
            message:
              "La cantidad para productos con número de serie debe ser 1.",
          });
      }
    } else {
      // Validaciones para productos sin número de serie
      if (TipoMovimiento === "Salida") {
        // Verificar que la cantidad no sea mayor a CantidadActual del lote
        if (cantidadInt > lote.CantidadActual) {
          return res
            .status(400)
            .json({
              message:
                "La cantidad no puede ser mayor que la cantidad actual del lote.",
            });
        }
      } else if (TipoMovimiento === "Entrada") {
        // Calcular la cantidad que ha salido del lote
        const cantidadQueHaSalido = lote.CantidadInicial - lote.CantidadActual;

        // Verificar que haya productos para devolver
        if (cantidadQueHaSalido <= 0) {
          return res
            .status(400)
            .json({ message: "No hay productos para devolver en este lote." });
        }

        // Verificar que la cantidad no sea mayor a la cantidad que ha salido
        if (cantidadInt > cantidadQueHaSalido) {
          return res
            .status(400)
            .json({
              message:
                "La cantidad no puede ser mayor que la cantidad que ha salido del lote.",
            });
        }
      }
    }

    // Insertar el movimiento en MovimientosInventario
    const insertMovimientoQuery = `
      INSERT INTO MovimientosInventario (IdLote, TipoMovimiento, Cantidad, Notas, IdUsuario, NumSerie)
      VALUES (@IdLote, @TipoMovimiento, @Cantidad, @Notas, @IdUsuario, @NumSerie)
      SELECT SCOPE_IDENTITY() AS IdMovimiento;
    `;

    let movimientoResult = await pool
      .request()
      .input("IdLote", sql.Int, IdLote)
      .input("TipoMovimiento", sql.NVarChar(10), TipoMovimiento)
      .input("Cantidad", sql.Int, cantidadInt)
      .input("Notas", sql.NVarChar(255), Notas || null)
      .input("IdUsuario", sql.Int, IdUsuario)
      .input("NumSerie", sql.NVarChar(30), hasNumSerie ? NumSerie : null)
      .query(insertMovimientoQuery);

    const IdMovimiento = movimientoResult.recordset[0].IdMovimiento;

    // Actualizar el estado del número de serie si es necesario
    if (hasNumSerie) {
      let nuevoEstado;
      if (TipoMovimiento === "Salida") {
        nuevoEstado = "Inactivo";
      } else if (TipoMovimiento === "Entrada") {
        nuevoEstado = "Activo";
      }

      await pool
        .request()
        .input("NumSerie", sql.NVarChar(30), NumSerie)
        .input("NuevoEstado", sql.NVarChar(50), nuevoEstado).query(`
          UPDATE DetalleProducto
          SET Estado = @NuevoEstado
          WHERE NumSerie = @NumSerie
        `);
    }

    // Enviar de vuelta el IdMovimiento creado
    res.status(201).json({ IdMovimiento });
  } catch (err) {
    console.error("SQL error", err);
    res.status(500).send("Error del servidor");
  }
});

// Endpoint de inicio de sesión
app.post("/api/login", async (req, res) => {
  try {
    const { Usuario, Contraseña } = req.body;

    // Validar entrada
    if (!Usuario || !Contraseña) {
      return res.status(400).json({
        message: "El nombre de usuario y la contraseña son obligatorios.",
      });
    }

    let pool = await sql.connect(config);
    let request = pool.request();

    request.input("Usuario", sql.NVarChar(50), Usuario);

    // Obtener Usuario por usuario
    let result = await request.query(
      "SELECT * FROM Usuarios WHERE Usuario = @Usuario"
    );

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: "Credenciales inválidas." });
    }

    const user = result.recordset[0];

    // Verificar si el usuario está inactivo
    if (user.Estado === "Inactivo") {
      return res
        .status(403)
        .json({ message: "Acceso denegado, usuario inactivo." });
    }

    // Comparar contraseñas
    const match = await bcrypt.compare(Contraseña, user.Contraseña);

    if (!match) {
      return res.status(401).json({ message: "Credenciales inválidas." });
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        IdUsuario: user.IdUsuario,
        Usuario: user.Usuario,
        IdRol: user.IdRol,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ token });
  } catch (err) {
    console.error("Error en login", err);
    res.status(500).send("Error del servidor");
  }
});

// Endpoint para obtener todos los usuarios (necesario para listar en el frontend)
app.get("/api/usuarios", authenticateToken, authorizeRoles(1), async (req, res) => {
  try {
    let pool = await sql.connect(config);
    let result = await pool.request().query("SELECT IdUsuario, Usuario, Nombre, ApellidoPaterno, IdRol, Estado FROM Usuarios");
    res.json(result.recordset);
  } catch (err) {
    console.error("Error al obtener los usuarios", err);
    res.status(500).json({ message: "Error en el servidor." });
  }
});

// Endpoint para obtener un usuario por su ID
app.get("/api/usuarios/:id", authenticateToken, authorizeRoles(1), async (req, res) => {
  try {
    const { id } = req.params;
    let pool = await sql.connect(config);
    let result = await pool.request().input("IdUsuario", sql.Int, id).query("SELECT IdUsuario, Usuario, Nombre, ApellidoPaterno, IdRol, Estado FROM Usuarios WHERE IdUsuario = @IdUsuario");
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "El usuario especificado no existe." });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Error al obtener el usuario", err);
    res.status(500).json({ message: "Error en el servidor." });
  }
});

// Endpoint para actualizar un usuario existente (actualizado para permitir modificar 'Usuario')
app.put("/api/usuarios/:id", authenticateToken, authorizeRoles(1), async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, nombre, apellidoPaterno, IdRol, estado } = req.body;

    // Validar campos requeridos
    if (!usuario || !nombre || !apellidoPaterno || !IdRol || !estado) {
      return res.status(400).json({ message: "Todos los campos son obligatorios." });
    }

    // Validar tipos de datos
    if (typeof usuario !== "string" || usuario.trim() === "") {
      return res.status(400).json({ message: 'El campo "usuario" debe ser una cadena de texto no vacía.' });
    }

    if (typeof nombre !== "string" || nombre.trim() === "") {
      return res.status(400).json({ message: 'El campo "nombre" debe ser una cadena de texto no vacía.' });
    }

    if (typeof apellidoPaterno !== "string" || apellidoPaterno.trim() === "") {
      return res.status(400).json({ message: 'El campo "apellidoPaterno" debe ser una cadena de texto no vacía.' });
    }

    // Validar IdRol
    const validRoles = [1, 2, 3];
    if (!validRoles.includes(IdRol)) {
      return res.status(400).json({ message: "El rol especificado no es válido." });
    }

    // Validar Estado
    const validStates = ["Activo", "Inactivo"];
    if (!validStates.includes(estado)) {
      return res.status(400).json({ message: "El estado especificado no es válido." });
    }

    let pool = await sql.connect(config);

    // Verificar si el usuario existe
    const userResult = await pool
      .request()
      .input("IdUsuario", sql.Int, id)
      .query("SELECT * FROM Usuarios WHERE IdUsuario = @IdUsuario");

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ message: "El usuario especificado no existe." });
    }

    // Verificar si el nuevo nombre de usuario ya está en uso por otro usuario
    const usuarioExistente = await pool
      .request()
      .input("Usuario", sql.NVarChar(50), usuario)
      .input("IdUsuario", sql.Int, id)
      .query("SELECT * FROM Usuarios WHERE Usuario = @Usuario AND IdUsuario <> @IdUsuario");

    if (usuarioExistente.recordset.length > 0) {
      return res.status(400).json({ message: "El nombre de usuario ya está en uso por otro usuario." });
    }

    // Actualizar datos del usuario
    const updateQuery = `
      UPDATE Usuarios
      SET Usuario = @Usuario,
          Nombre = @Nombre,
          ApellidoPaterno = @ApellidoPaterno,
          IdRol = @IdRol,
          Estado = @Estado
      WHERE IdUsuario = @IdUsuario
    `;

    await pool
      .request()
      .input("IdUsuario", sql.Int, id)
      .input("Usuario", sql.NVarChar(50), usuario)
      .input("Nombre", sql.NVarChar(50), nombre)
      .input("ApellidoPaterno", sql.NVarChar(50), apellidoPaterno)
      .input("IdRol", sql.Int, IdRol)
      .input("Estado", sql.NVarChar(10), estado)
      .query(updateQuery);

    res.status(200).json({ message: "Usuario actualizado exitosamente." });
  } catch (err) {
    console.error("Error al actualizar el usuario", err);
    // Manejo de errores de clave duplicada (si el nombre de usuario ya existe)
    if (err.number === 2627 || err.number === 2601) {
      res.status(400).json({ message: "El nombre de usuario ya existe en el sistema." });
    } else {
      res.status(500).json({ message: "Error en el servidor." });
    }
  }
});





//Endpoint para registrar nuevo usuario

app.post(
  "/api/nuevoUsuario",
  authenticateToken,
  authorizeRoles(1),
  async (req, res) => {
    try {
      const { usuario, nombre, apellidoPaterno, contraseña, IdRol } = req.body;

      // Validaciones básicas
      if (!usuario || !nombre || !apellidoPaterno || !contraseña || !IdRol) {
        return res
          .status(400)
          .json({ message: "Todos los campos son obligatorios." });
      }

      // Validar tipos de datos
      if (typeof usuario !== "string" || usuario.trim() === "") {
        return res
          .status(400)
          .json({
            message:
              'El campo "usuario" debe ser una cadena de texto no vacía.',
          });
      }

      if (typeof nombre !== "string" || nombre.trim() === "") {
        return res
          .status(400)
          .json({
            message: 'El campo "nombre" debe ser una cadena de texto no vacía.',
          });
      }

      if (
        typeof apellidoPaterno !== "string" ||
        apellidoPaterno.trim() === ""
      ) {
        return res
          .status(400)
          .json({
            message:
              'El campo "apellidoPaterno" debe ser una cadena de texto no vacía.',
          });
      }

      if (typeof contraseña !== "string" || contraseña.trim() === "") {
        return res
          .status(400)
          .json({
            message:
              'El campo "contraseña" debe ser una cadena de texto no vacía.',
          });
      }
      // Validar IdRol
      const rolValido = [1, 2, 3].includes(IdRol);
      if (!rolValido) {
        return res
          .status(400)
          .json({ message: "El rol especificado no es válido." });
      }

      let pool = await sql.connect(config);

      // Verificar si el usuario ya existe
      const usuarioExistente = await pool
        .request()
        .input("Usuario", sql.NVarChar(50), usuario)
        .query("SELECT * FROM Usuarios WHERE Usuario = @Usuario");

      if (usuarioExistente.recordset.length > 0) {
        return res
          .status(400)
          .json({ message: "El usuario ya existe. Por favor, elige otro." });
      }

      // Hash de la nueva contraseña
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(contraseña, saltRounds);

      const insertQuery = `
    INSERT INTO Usuarios (Usuario, Nombre, ApellidoPaterno, Contraseña, IdRol, Estado)
    VALUES (@Usuario, @Nombre, @ApellidoPaterno, @Contraseña, @IdRol, 'Activo')
    SELECT SCOPE_IDENTITY() AS IdUsuario
  `;

      const insertResult = await pool
        .request()
        .input("Usuario", sql.NVarChar(50), usuario)
        .input("Nombre", sql.NVarChar(50), nombre)
        .input("ApellidoPaterno", sql.NVarChar(50), apellidoPaterno)
        .input("Contraseña", sql.NVarChar(255), hashedPassword)
        .input("IdRol", sql.Int, IdRol)
        .query(insertQuery);

      const IdUsuario = insertResult.recordset[0].IdUsuario;
      res
        .status(201)
        .json({ message: "Usuario creado exitosamente.", IdUsuario });
    } catch (err) {
      console.error("Error al crear un nuevo usuario", err);
      // Manejo de errores de clave duplicada (si no añadiste restricción única)
      if (err.number === 2627 || err.number === 2601) {
        res
          .status(400)
          .json({ message: "El usuario ya existe en el sistema." });
      } else {
        res.status(500).json({ message: "Error en el servidor." });
      }
    }
  }
);

// Endpoint para restablecer contraseña
app.post(
  "/api/restablecerPassword",
  authenticateToken,
  authorizeRoles(1),
  async (req, res) => {
    try {
      const { Usuario, NuevaContraseña } = req.body;

      // Validar entrada
      if (!Usuario || !NuevaContraseña) {
        return res
          .status(400)
          .json({
            message:
              "El nombre de usuario y la nueva contraseña son obligatorios.",
          });
      }

      let pool = await sql.connect(config);
      let request = pool.request();

      request.input("Usuario", sql.NVarChar(50), Usuario);

      // Verificar si el usuario existe
      let result = await request.query(
        "SELECT * FROM Usuarios WHERE Usuario = @Usuario"
      );

      if (result.recordset.length === 0) {
        return res
          .status(404)
          .json({ message: "El usuario especificado no existe." });
      }

      // Hash de la nueva contraseña
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(NuevaContraseña, saltRounds);

      // Actualizar la contraseña en la base de datos
      await pool
        .request()
        .input("Contraseña", sql.NVarChar(255), hashedPassword)
        .input("Usuario", sql.NVarChar(50), Usuario)
        .query(
          "UPDATE Usuarios SET Contraseña = @Contraseña WHERE Usuario = @Usuario"
        );

      res.json({ message: "Contraseña restablecida correctamente." });
    } catch (err) {
      console.error("Error al restablecer la contraseña", err);
      res.status(500).send("Error del servidor");
    }
  }
);

// Middleware de autenticación
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Formato: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ message: "Token no proporcionado." });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Token inválido." });
    }
    req.user = user;
    next();
  });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
