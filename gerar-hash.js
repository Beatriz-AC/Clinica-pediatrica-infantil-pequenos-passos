// Uso: node gerar-hash.js [texto]                 -> apenas imprime o hash bcrypt
//      node gerar-hash.js --salvar [cpf] [senha]  -> grava/atualiza um usuário (CPF e senha em hash)
import bcrypt from 'bcrypt';

const args = process.argv.slice(2);
const salvarNoBanco = args[0] === '--salvar';
if (salvarNoBanco) args.shift();

if (!salvarNoBanco) {
  console.log(await bcrypt.hash(args[0] || '123456', 10));
} else {
  const cpf = (args[0] || '12345678900').replace(/\D/g, '');
  const senha = args[1] || '123456';
  const cpfHash = await bcrypt.hash(cpf, 10);
  const senhaHash = await bcrypt.hash(senha, 10);
  console.log('CPF (hash):  ', cpfHash);
  console.log('Senha (hash):', senhaHash);

  const { pool } = await import('./db.js');
  try {
    // O CPF está em hash, então procuramos o usuário comparando com cada hash
    const todos = await pool.query('SELECT id, cpf FROM usuarios');
    let existente = null;
    for (const u of todos.rows) {
      if (await bcrypt.compare(cpf, u.cpf)) {
        existente = u;
        break;
      }
    }
    if (existente) {
      await pool.query('UPDATE usuarios SET senha = $1 WHERE id = $2', [senhaHash, existente.id]);
      console.log('Senha do usuário atualizada.');
    } else {
      await pool.query('INSERT INTO usuarios (nome, cpf, senha) VALUES ($1, $2, $3)', [
        'Operador',
        cpfHash,
        senhaHash
      ]);
      console.log('Usuário gravado!');
    }
  } finally {
    await pool.end();
  }
}
