INSERT INTO Clients (Id, Nome, Email, Telefone, Documento, Endereco, Observacoes)
VALUES
('11111111-1111-1111-1111-111111111111', 'Carlos Eduardo da Silva', 'carlos.edu@gmail.com', '(11) 98765-4321', '123.456.789-00', 'Av. Paulista, 1000 - Sao Paulo - SP', 'Cliente premium. Prefere atendimento aos fins de semana.'),
('22222222-2222-2222-2222-222222222222', 'Mariana Alencar Costa', 'mariana.costa@empresa.com.br', '(11) 99888-7766', '45.678.901/0001-23', 'Rua das Figueiras, 450 - Santo Andre - SP', 'Eventos corporativos frequentes.');

INSERT INTO Employees (Id, Nome, Cargo, Telefone, ValorDiaria, TipoPagamento, Observacoes)
VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rodrigo Vasconcelos', 'Bartender Principal', '(11) 91111-2222', 250.00, 'diaria', 'Especialista em coqueteis premium.'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Ana Carolina Santos', 'Decoradora e Florista', '(11) 92222-3333', 350.00, 'diaria', 'Responsavel por design floral.'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Daniel Souza Lima', 'DJ e Tecnico de Som', '(11) 93333-4444', 400.00, 'diaria', 'Possui equipamento proprio.');

INSERT INTO Services (Id, Nome, Descricao, Valor, DuracaoHoras, Categoria, Status)
VALUES
('01010101-0101-0101-0101-010101010101', 'Servico de Garcons', 'Equipe com 3 garcons treinados e uniformizados.', 540.00, 6, 'Servico de Apoio', 'ativo'),
('02020202-0202-0202-0202-020202020202', 'Decoracao Tematica Completa', 'Arranjos florais, painel decorativo e mobiliario.', 3500.00, 12, 'Decoracao', 'ativo'),
('03030303-0303-0303-0303-030303030303', 'Som e DJ', 'DJ profissional, caixas ativas, microfones e mesa de som.', 1200.00, 8, 'Som e Iluminacao', 'ativo'),
('04040404-0404-0404-0404-040404040404', 'Open Bar de Coqueteis', 'Bar iluminado, bartenders e insumos para coqueteis.', 2500.00, 6, 'Bebidas e Bar', 'ativo');

INSERT INTO ServiceOrders (Id, Codigo, ClienteId, DataEvento, HorarioInicio, HorarioFim, Local, Status, FormaPagamento, Observacoes, AssinaturaNome, ValorTotal)
VALUES
('99999999-9999-9999-9999-999999999999', 'OS-2026-0001', '11111111-1111-1111-1111-111111111111', '2026-05-15', '18:00', '23:59', 'Espaco Jardins - Sao Paulo - SP', 'CONFIRMADO', 'Pix 50/50', 'Montagem ate 15h.', 'Carlos Eduardo da Silva', 5240.00);

INSERT INTO ServiceOrderItems (OrderId, ServiceId, Quantidade, ValorUnitario)
VALUES
('99999999-9999-9999-9999-999999999999', '02020202-0202-0202-0202-020202020202', 1, 3500.00),
('99999999-9999-9999-9999-999999999999', '03030303-0303-0303-0303-030303030303', 1, 1200.00),
('99999999-9999-9999-9999-999999999999', '01010101-0101-0101-0101-010101010101', 1, 540.00);

INSERT INTO ServiceOrderEmployees (OrderId, EmployeeId)
VALUES
('99999999-9999-9999-9999-999999999999', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
('99999999-9999-9999-9999-999999999999', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

INSERT INTO Transactions (Tipo, Categoria, Descricao, Valor, Data, Status, OsId)
VALUES
('receita', 'Eventos', 'Entrada OS-2026-0001', 2620.00, '2026-01-20', 'pago', '99999999-9999-9999-9999-999999999999'),
('despesa', 'Marketing', 'Trafego pago Instagram/Google Ads', 600.00, '2026-05-01', 'pago', NULL);