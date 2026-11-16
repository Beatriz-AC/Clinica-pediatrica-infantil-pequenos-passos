// Bloqueia o acesso às rotas protegidas quando não há usuário logado na sessão
export function verificarAutenticacao(req, res, next) {
  if (req.session && req.session.usuario) {
    return next();
  }
  res.redirect('/login');
}
