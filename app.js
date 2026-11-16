import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { verificarAutenticacao } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const SALT_ROUNDS = 10;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));

// ---------- SESSÃO (RN04): expira após 30 min de inatividade ----------
app.use(
  session({
    secret: 'segredo-pequenos-passos',
    resave: false,
    saveUninitialized: false,
    rolling: true, // renova o prazo a cada requisição (inatividade)
    cookie: { maxAge: 1000 * 60 * 30 }
  })
);

// Disponibiliza o usuário logado para todas as views
app.use((req, res, next) => {
  res.locals.usuario = req.session.usuario || null;
  next();
});

// ---------- HELPERS ----------
const pad = (n) => String(n).padStart(2, '0');
app.locals.fmtData = (d) => (d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '');
app.locals.paraInputData = (d) =>
  d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';

// Express 4 não captura erros de funções async: este wrapper encaminha para o handler de erro
const rota = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const somenteDigitos = (v) => String(v || '').replace(/\D/g, '');

// O CPF é guardado como hash (bcrypt) e não pode ser comparado via SQL:
// para detectar duplicidade comparamos o CPF informado com cada hash salvo.
async function cpfJaCadastrado(digitos, ignorarId = null) {
  const r = await pool.query('SELECT id, cpf FROM responsaveis');
  for (const row of r.rows) {
    if (ignorarId !== null && row.id === Number(ignorarId)) continue;
    if (await bcrypt.compare(digitos, row.cpf)) return true;
  }
  return false;
}

// ---------- LOGIN / LOGOUT (RN03, RN04) ----------
app.get('/', (req, res) => res.redirect(req.session.usuario ? '/painel' : '/login'));

app.get('/login', (req, res) => {
  if (req.session.usuario) return res.redirect('/painel');
  res.render('login', { erro: null });
});

app.post(
  '/login',
  rota(async (req, res) => {
    const { cpf, senha } = req.body;
    const digitos = somenteDigitos(cpf);
    // O CPF do usuário também está em hash: comparamos o CPF informado com cada hash
    // e, ao achar o usuário, conferimos a senha (também em hash).
    const r = await pool.query('SELECT * FROM usuarios');
    let usuario = null;
    if (digitos.length === 11) {
      for (const u of r.rows) {
        if (await bcrypt.compare(digitos, u.cpf)) {
          usuario = u;
          break;
        }
      }
    }
    if (usuario && (await bcrypt.compare(senha || '', usuario.senha))) {
      req.session.usuario = { id: usuario.id, nome: usuario.nome };
      return res.redirect('/painel');
    }
    res.render('login', { erro: 'CPF ou senha inválidos.' });
  })
);

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

// ---------- PAINEL (RN05) ----------
app.get(
  '/painel',
  verificarAutenticacao,
  rota(async (req, res) => {
    const r = await pool.query(`
      SELECT (SELECT COUNT(*) FROM responsaveis)::int AS responsaveis,
             (SELECT COUNT(*) FROM criancas)::int AS criancas,
             (SELECT COUNT(*) FROM agendamentos WHERE data_consulta >= CURRENT_DATE)::int AS agendamentos`);
    res.render('painel', { totais: r.rows[0] });
  })
);

// ---------- RESPONSÁVEIS (RN02, RN06) ----------
app.get(
  '/responsaveis',
  verificarAutenticacao,
  rota(async (req, res) => {
    const busca = (req.query.busca || '').trim();
    const porNome = await pool.query(
      'SELECT id, nome, telefone, email FROM responsaveis WHERE nome ILIKE $1 ORDER BY nome',
      [`%${busca}%`]
    );
    let lista = porNome.rows;

    // Busca por CPF: o CPF está em hash, então comparamos o termo com cada hash
    const digitos = somenteDigitos(busca);
    if (digitos.length === 11) {
      const todos = await pool.query('SELECT id, nome, telefone, email, cpf FROM responsaveis');
      for (const r of todos.rows) {
        if (!lista.some((x) => x.id === r.id) && (await bcrypt.compare(digitos, r.cpf))) {
          lista.push({ id: r.id, nome: r.nome, telefone: r.telefone, email: r.email });
        }
      }
      lista.sort((a, b) => a.nome.localeCompare(b.nome));
    }
    res.render('responsaveis', { responsaveis: lista, busca, erro: req.query.erro || null });
  })
);

app.get('/responsaveis/novo', verificarAutenticacao, (req, res) => {
  res.render('form-responsavel', {
    titulo: 'Novo responsável',
    action: '/responsaveis',
    responsavel: {},
    editando: false,
    erro: null
  });
});

app.post(
  '/responsaveis',
  verificarAutenticacao,
  rota(async (req, res) => {
    const { nome, cpf, telefone, email } = req.body;
    const digitos = somenteDigitos(cpf);
    let erro = null;
    if (!nome || !nome.trim()) erro = 'Informe o nome do responsável.';
    else if (digitos.length !== 11) erro = 'CPF inválido: informe os 11 dígitos.';
    else if (await cpfJaCadastrado(digitos)) erro = 'Já existe um responsável cadastrado com este CPF.';

    if (erro) {
      return res.render('form-responsavel', {
        titulo: 'Novo responsável',
        action: '/responsaveis',
        responsavel: { nome, telefone, email },
        editando: false,
        erro
      });
    }

    const cpfHash = await bcrypt.hash(digitos, SALT_ROUNDS); // RN02
    await pool.query('INSERT INTO responsaveis (nome, cpf, telefone, email) VALUES ($1, $2, $3, $4)', [
      nome.trim(),
      cpfHash,
      telefone || null,
      email || null
    ]);
    res.redirect('/responsaveis');
  })
);

app.get(
  '/responsaveis/:id/editar',
  verificarAutenticacao,
  rota(async (req, res) => {
    const r = await pool.query('SELECT id, nome, telefone, email FROM responsaveis WHERE id = $1', [
      req.params.id
    ]);
    if (!r.rows[0]) return res.redirect('/responsaveis');
    res.render('form-responsavel', {
      titulo: 'Editar responsável',
      action: `/responsaveis/${req.params.id}/editar`,
      responsavel: r.rows[0],
      editando: true,
      erro: null
    });
  })
);

app.post(
  '/responsaveis/:id/editar',
  verificarAutenticacao,
  rota(async (req, res) => {
    const { nome, cpf, telefone, email } = req.body;
    const digitos = somenteDigitos(cpf);
    let erro = null;
    if (!nome || !nome.trim()) erro = 'Informe o nome do responsável.';
    else if (digitos && digitos.length !== 11) erro = 'CPF inválido: informe os 11 dígitos.';
    else if (digitos && (await cpfJaCadastrado(digitos, req.params.id)))
      erro = 'Já existe outro responsável cadastrado com este CPF.';

    if (erro) {
      return res.render('form-responsavel', {
        titulo: 'Editar responsável',
        action: `/responsaveis/${req.params.id}/editar`,
        responsavel: { id: req.params.id, nome, telefone, email },
        editando: true,
        erro
      });
    }

    if (digitos) {
      // CPF novo informado: grava o novo hash
      const cpfHash = await bcrypt.hash(digitos, SALT_ROUNDS);
      await pool.query('UPDATE responsaveis SET nome=$1, cpf=$2, telefone=$3, email=$4 WHERE id=$5', [
        nome.trim(),
        cpfHash,
        telefone || null,
        email || null,
        req.params.id
      ]);
    } else {
      // CPF em branco: mantém o hash existente
      await pool.query('UPDATE responsaveis SET nome=$1, telefone=$2, email=$3 WHERE id=$4', [
        nome.trim(),
        telefone || null,
        email || null,
        req.params.id
      ]);
    }
    res.redirect('/responsaveis');
  })
);

app.post(
  '/responsaveis/:id/excluir',
  verificarAutenticacao,
  rota(async (req, res) => {
    try {
      await pool.query('DELETE FROM responsaveis WHERE id = $1', [req.params.id]);
      res.redirect('/responsaveis');
    } catch (e) {
      if (e.code === '23503') {
        return res.redirect(
          '/responsaveis?erro=' +
            encodeURIComponent('Não é possível excluir: o responsável possui crianças cadastradas.')
        );
      }
      throw e;
    }
  })
);

// ---------- CRIANÇAS (RN07) ----------
async function listarResponsaveis() {
  const r = await pool.query('SELECT id, nome FROM responsaveis ORDER BY nome');
  return r.rows;
}

app.get(
  '/criancas',
  verificarAutenticacao,
  rota(async (req, res) => {
    const r = await pool.query(
      `SELECT c.id, c.nome, c.data_nascimento, r.nome AS responsavel_nome
         FROM criancas c
         JOIN responsaveis r ON r.id = c.responsavel_id
        ORDER BY c.nome`
    );
    res.render('criancas', { criancas: r.rows, erro: req.query.erro || null });
  })
);

app.get(
  '/criancas/nova',
  verificarAutenticacao,
  rota(async (req, res) => {
    res.render('form-crianca', {
      titulo: 'Nova criança',
      action: '/criancas',
      crianca: {},
      responsaveis: await listarResponsaveis(),
      erro: null
    });
  })
);

app.post(
  '/criancas',
  verificarAutenticacao,
  rota(async (req, res) => {
    const { nome, data_nascimento, responsavel_id } = req.body;
    if (!nome || !nome.trim() || !data_nascimento || !responsavel_id) {
      return res.render('form-crianca', {
        titulo: 'Nova criança',
        action: '/criancas',
        crianca: { nome, data_nascimento: null, responsavel_id },
        responsaveis: await listarResponsaveis(),
        erro: 'Preencha o nome, a data de nascimento e selecione um responsável.'
      });
    }
    await pool.query('INSERT INTO criancas (nome, data_nascimento, responsavel_id) VALUES ($1, $2, $3)', [
      nome.trim(),
      data_nascimento,
      responsavel_id
    ]);
    res.redirect('/criancas');
  })
);

app.get(
  '/criancas/:id/editar',
  verificarAutenticacao,
  rota(async (req, res) => {
    const r = await pool.query('SELECT * FROM criancas WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.redirect('/criancas');
    res.render('form-crianca', {
      titulo: 'Editar criança',
      action: `/criancas/${req.params.id}/editar`,
      crianca: r.rows[0],
      responsaveis: await listarResponsaveis(),
      erro: null
    });
  })
);

app.post(
  '/criancas/:id/editar',
  verificarAutenticacao,
  rota(async (req, res) => {
    const { nome, data_nascimento, responsavel_id } = req.body;
    if (!nome || !nome.trim() || !data_nascimento || !responsavel_id) {
      return res.render('form-crianca', {
        titulo: 'Editar criança',
        action: `/criancas/${req.params.id}/editar`,
        crianca: { id: req.params.id, nome, data_nascimento: null, responsavel_id },
        responsaveis: await listarResponsaveis(),
        erro: 'Preencha o nome, a data de nascimento e selecione um responsável.'
      });
    }
    await pool.query('UPDATE criancas SET nome=$1, data_nascimento=$2, responsavel_id=$3 WHERE id=$4', [
      nome.trim(),
      data_nascimento,
      responsavel_id,
      req.params.id
    ]);
    res.redirect('/criancas');
  })
);

app.post(
  '/criancas/:id/excluir',
  verificarAutenticacao,
  rota(async (req, res) => {
    // Os agendamentos da criança são removidos junto (ON DELETE CASCADE)
    await pool.query('DELETE FROM criancas WHERE id = $1', [req.params.id]);
    res.redirect('/criancas');
  })
);

// ---------- AGENDAMENTOS (RN08) ----------
app.get(
  '/agendamentos',
  verificarAutenticacao,
  rota(async (req, res) => {
    const ag = await pool.query(
      `SELECT a.id, a.data_consulta, a.motivo,
              c.nome AS crianca_nome, c.data_nascimento,
              r.nome AS responsavel_nome, r.telefone AS responsavel_telefone, r.email AS responsavel_email
         FROM agendamentos a
         JOIN criancas c ON c.id = a.crianca_id
         JOIN responsaveis r ON r.id = c.responsavel_id
        ORDER BY a.data_consulta ASC`
    );
    const criancas = await pool.query(
      `SELECT c.id, c.nome, r.nome AS responsavel_nome
         FROM criancas c JOIN responsaveis r ON r.id = c.responsavel_id
        ORDER BY c.nome`
    );
    res.render('agendamentos', {
      agendamentos: ag.rows,
      criancas: criancas.rows,
      erro: req.query.erro || null
    });
  })
);

app.post(
  '/agendamentos',
  verificarAutenticacao,
  rota(async (req, res) => {
    const { crianca_id, data_consulta, motivo } = req.body;
    if (!crianca_id || !data_consulta) {
      return res.redirect('/agendamentos?erro=' + encodeURIComponent('Selecione a criança e a data da consulta.'));
    }
    await pool.query('INSERT INTO agendamentos (crianca_id, data_consulta, motivo) VALUES ($1, $2, $3)', [
      crianca_id,
      data_consulta,
      motivo || null
    ]);
    res.redirect('/agendamentos');
  })
);

app.post(
  '/agendamentos/:id/remarcar',
  verificarAutenticacao,
  rota(async (req, res) => {
    const { data_consulta } = req.body;
    if (!data_consulta) {
      return res.redirect('/agendamentos?erro=' + encodeURIComponent('Informe a nova data da consulta.'));
    }
    await pool.query('UPDATE agendamentos SET data_consulta = $1 WHERE id = $2', [
      data_consulta,
      req.params.id
    ]);
    res.redirect('/agendamentos');
  })
);

app.post(
  '/agendamentos/:id/excluir',
  verificarAutenticacao,
  rota(async (req, res) => {
    await pool.query('DELETE FROM agendamentos WHERE id = $1', [req.params.id]);
    res.redirect('/agendamentos');
  })
);

// ---------- ERRO GERAL ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('erro');
});

app.listen(3000, () => console.log('Servidor rodando em http://localhost:3000'));
