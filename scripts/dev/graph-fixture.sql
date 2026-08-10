-- Synthetic development fixture for the Funding and Influence graph.
--
-- NOT DATA. Every entity below is invented, the names are deliberate
-- placeholders, and nothing here carries a citation. It exists so the graph
-- interface can be built and tested before real sourced records are ingested.
--
--   load:   psql "$DATABASE_URL" -f scripts/dev/graph-fixture.sql
--   remove: psql "$DATABASE_URL" -f scripts/dev/graph-fixture.sql -v teardown=1
--
-- No build script references this file, and it must never run against
-- production. The shape is chosen to exercise the one case the architecture
-- exists to handle: a foundation funds an NGO, the NGO campaigns against a
-- project, and an outcome follows. The graph shows those four documented
-- facts and draws no line between the first and the last.

\if :{?teardown}
  DELETE FROM outcomes WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  DELETE FROM campaign_targets WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  DELETE FROM campaign_participants WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  DELETE FROM board_positions WHERE id::text LIKE '99999999-%';
  DELETE FROM funding_transactions WHERE id::text LIKE '88888888-%';
  DELETE FROM campaigns WHERE id = '77777777-7777-4777-8777-777777777777';
  DELETE FROM projects WHERE id = '66666666-6666-4666-8666-666666666666';
  DELETE FROM people WHERE id = '55555555-5555-4555-8555-555555555555';
  DELETE FROM citations WHERE source_id::text LIKE 'dddddddd-%';
  DELETE FROM sources WHERE id::text LIKE 'dddddddd-%';
  DELETE FROM orgs WHERE id::text ~ '^(1111|2222|3333|4444)';
\else
-- A deliberately awkward shape: Foundation funds an NGO; the NGO campaigns
-- against a project a company operates; a person bridges the NGO and a media
-- outlet the same foundation funds. Nothing here asserts a motive.
INSERT INTO orgs (id, slug, name, kind) VALUES
 ('11111111-1111-4111-8111-111111111111','fx-foundation','Foundation X','foundation'),
 ('22222222-2222-4222-8222-222222222222','ngo-y','NGO Y','ngo'),
 ('33333333-3333-4333-8333-333333333333','media-z','Media Z','media'),
 ('44444444-4444-4444-8444-444444444444','company-c','Company C','company');
INSERT INTO people (id, slug, name, public_role_basis) VALUES
 ('55555555-5555-4555-8555-555555555555','person-p','Person P','Trustee of NGO Y and editor of Media Z, per both annual reports.');
INSERT INTO projects (id, slug, name, kind, state_id, operator_org_id) VALUES
 ('66666666-6666-4666-8666-666666666666','project-c','Project C','infrastructure','gj','44444444-4444-4444-8444-444444444444');
INSERT INTO campaigns (id, slug, name, start_on, end_on) VALUES
 ('77777777-7777-4777-8777-777777777777','save-the-coast','Save the Coast','2016-03-01','2019-08-01');
INSERT INTO funding_transactions (id, donor_type, donor_id, recipient_type, recipient_id, amount, currency, financial_year, funding_type, stated_purpose, evidence_status) VALUES
 ('88888888-8888-4888-8888-888888888881','org','11111111-1111-4111-8111-111111111111','org','22222222-2222-4222-8222-222222222222',5000000,'INR','2016-17','grant','Coastal ecology research','verified'),
 ('88888888-8888-4888-8888-888888888882','org','11111111-1111-4111-8111-111111111111','org','33333333-3333-4333-8333-333333333333',2500000,'INR','2021-22','grant','Environment desk','documented');
INSERT INTO board_positions (id, person_id, org_id, role, role_kind, start_on) VALUES
 ('99999999-9999-4999-8999-999999999991','55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222','Trustee','trustee','2014-01-01'),
 ('99999999-9999-4999-8999-999999999992','55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333','Editor','editor','2020-06-01');
INSERT INTO campaign_participants (id, campaign_id, participant_type, participant_id, role) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','77777777-7777-4777-8777-777777777777','org','22222222-2222-4222-8222-222222222222','Convenor');
INSERT INTO campaign_targets (id, campaign_id, target_type, target_id, stance) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','77777777-7777-4777-8777-777777777777','project','66666666-6666-4666-8666-666666666666','against');
INSERT INTO outcomes (id, subject_type, subject_id, kind, occurred_on, summary) VALUES
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1','project','66666666-6666-4666-8666-666666666666','project_delayed','2018-11-20','Environmental clearance remanded; work paused.');
-- Sources, so the evidence panel has something to open. Three of the eight
-- relationships are cited and five are not, deliberately: the panel has to be
-- honest about an uncited edge, and that path needs testing too.
INSERT INTO sources (id, title, url, publisher, published_on, kind, is_official, is_primary) VALUES
 ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','Foundation X Annual Report 2016-17','https://example.org/fx-annual-2016-17.pdf','Foundation X','2017-08-01','annual_report',false,true),
 ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2','Register of Trustees, NGO Y','https://example.org/ngoy-trustees','NGO Y','2014-04-01','org_document',false,true),
 ('dddddddd-dddd-4ddd-8ddd-ddddddddddd3','Order in Project C clearance appeal','https://example.gov.in/orders/2018/project-c','National Green Tribunal','2018-11-20','court_judgment',true,true)
 ON CONFLICT (url) DO NOTHING;
INSERT INTO citations (subject_type, subject_id, source_id, note) VALUES
 ('funding_transaction','88888888-8888-4888-8888-888888888881','dddddddd-dddd-4ddd-8ddd-ddddddddddd1','Schedule of grants, page 42'),
 ('board_position','99999999-9999-4999-8999-999999999991','dddddddd-dddd-4ddd-8ddd-ddddddddddd2',NULL),
 ('outcome','cccccccc-cccc-4ccc-8ccc-ccccccccccc1','dddddddd-dddd-4ddd-8ddd-ddddddddddd3','Paragraph 31')
 ON CONFLICT DO NOTHING;
\endif
