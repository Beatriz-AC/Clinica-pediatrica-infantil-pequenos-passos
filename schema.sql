-- 1. Usuários do sistema (recepcionistas / atendentes) - login por CPF + senha
CREATE TABLE usuarios (
    id    SERIAL PRIMARY KEY,
    nome  VARCHAR(100) NOT NULL,
    cpf   VARCHAR(100) NOT NULL,         -- hash bcrypt do CPF (login por CPF)
    senha VARCHAR(255) NOT NULL          -- hash bcrypt
);

-- 2. Responsáveis (pais/mães)
CREATE TABLE responsaveis (
    id       SERIAL PRIMARY KEY,
    nome     VARCHAR(150) NOT NULL,
    cpf      VARCHAR(100) NOT NULL,      -- hash bcrypt do CPF (LGPD)
    telefone VARCHAR(20),
    email    VARCHAR(150)
);

-- 3. Crianças (pacientes) - vínculo obrigatório com um responsável
CREATE TABLE criancas (
    id              SERIAL PRIMARY KEY,
    nome            VARCHAR(150) NOT NULL,
    data_nascimento DATE NOT NULL,
    responsavel_id  INT NOT NULL REFERENCES responsaveis(id) ON DELETE RESTRICT
);

-- 4. Agendamentos de consultas
CREATE TABLE agendamentos (
    id            SERIAL PRIMARY KEY,
    crianca_id    INT NOT NULL REFERENCES criancas(id) ON DELETE CASCADE,
    data_consulta DATE NOT NULL,
    motivo        VARCHAR(200)
);

CREATE INDEX idx_agendamentos_data ON agendamentos (data_consulta);

-- =====================================================================
-- POPULAÇÃO (mínimo de 3 registros por tabela - RN01)
-- =====================================================================

-- Usuários (senha de todos: 123456). CPFs de teste em comentário; no banco ficam só os hashes
--   Ana Paula Souza: 390.533.447-05
--   Carlos Mendes: 862.883.667-57
--   Fernanda Lima: 453.178.287-91
INSERT INTO usuarios (nome, cpf, senha) VALUES
('Ana Paula Souza', '$2b$10$FDa5mOiU0lh0UCnZI1JJYuWoRsXoPGd4cenEPO7HBprLcBe8kyFlm', '$2b$10$LjMYGmVYKYZ9t12YHHQF5eHnGNTBB2BhIORiI5bZEf5OyO6PQfHOC'),
('Carlos Mendes', '$2b$10$WQ050IbV9.Xj/iv6R5X1Ke47Yp1tz.9TccZOj8z9WPhyVVrv3UVhS', '$2b$10$O8oqZsmyKeTFpaZhug67eO69sB8u/uRt3hVsTw/oWrmHI125bth1q'),
('Fernanda Lima', '$2b$10$WJzSN5nflIs1kIu.WcDUjeR5mZc6rixDrqIAmK36zbqMWKIPKMFFq', '$2b$10$/6AfOF.IXBDCMnpoKuvNXecIN.i.yuE9XKi4XmQABeQNzPjjhqUT.');

-- Responsáveis (CPFs de teste em comentário; no banco ficam apenas os hashes)
--   Mariana Oliveira: 529.982.247-25
--   Roberto Almeida: 111.444.777-35
--   Juliana Costa: 123.456.789-09
--   Paulo Ferreira: 987.654.321-00
INSERT INTO responsaveis (nome, cpf, telefone, email) VALUES
('Mariana Oliveira', '$2b$10$M2LGyF/fbLjrszJKQKaPM.FQ8YWV87CaYnuWhDDCUNCyxiH09LD0u', '(19) 99111-0001', 'mariana@email.com'),
('Roberto Almeida', '$2b$10$gqCQd7kZrP3Tbx0FSp0JsOowgRsnDDMK03WMM5K15elZ0yLWJV1HK', '(19) 99111-0002', 'roberto@email.com'),
('Juliana Costa', '$2b$10$EC4elidSF4aWpcrp35FE0.9qX8ZxrY3po5Qmtp/fgEg9FKflGtA42', '(19) 99111-0003', 'juliana@email.com'),
('Paulo Ferreira', '$2b$10$QzH.71hTeo/md2pgjSLBP.enc50ZOEfQiGKXIxdxTcAzVafCyj3K.', '(19) 99111-0004', 'paulo@email.com');

-- Crianças
INSERT INTO criancas (nome, data_nascimento, responsavel_id) VALUES
('Lucas Oliveira',   '2021-03-15', 1),
('Sofia Oliveira',   '2023-08-02', 1),
('Miguel Almeida',   '2019-11-20', 2),
('Helena Costa',     '2022-05-09', 3),
('Davi Ferreira',    '2024-01-27', 4);

-- Agendamentos (inseridos fora de ordem de propósito; a listagem ordena por data)
INSERT INTO agendamentos (crianca_id, data_consulta, motivo) VALUES
(3, '2026-12-10', 'Consulta de rotina'),
(1, '2026-11-25', 'Retorno - avaliação de febre'),
(5, '2026-11-20', 'Vacinação'),
(2, '2026-12-02', 'Acompanhamento de crescimento'),
(4, '2026-11-30', 'Check-up anual');
