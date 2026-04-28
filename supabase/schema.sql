-- One Oak Property Management Schema
-- Run this in your Supabase SQL Editor

-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building TEXT NOT NULL, -- 'Ooak Suites', 'Ooak Residence', or custom
  unit_number TEXT NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'vacant' CHECK (status IN ('occupied', 'vacant', 'maintenance')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('checkin', 'checkout', 'maintenance')),
  tenant_name TEXT,
  date DATE NOT NULL,
  monthly_rental DECIMAL(10,2),
  security_deposit DECIMAL(10,2),
  utility_deposit DECIMAL(10,2),
  notes TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE service_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  bank_account TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE service_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  provider_id UUID REFERENCES service_providers(id),
  amount DECIMAL(10,2) DEFAULT 0,
  invoice_url TEXT,
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'proof_sent', 'paid')),
  payment_proof_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_records_unit_id ON records(unit_id);
CREATE INDEX idx_services_record_id ON services(record_id);
CREATE INDEX idx_services_provider_id ON services(provider_id);
CREATE INDEX idx_services_payment_status ON services(payment_status);
CREATE INDEX idx_units_status ON units(status);

-- ============================================================
-- STORAGE BUCKET (run separately or via Supabase dashboard)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', true);

-- ============================================================
-- SEED DATA: SERVICE PROVIDERS
-- ============================================================

INSERT INTO service_providers (name, bank_name, bank_account) VALUES
  ('Ariful Islam', 'Public Bank', '4874 2079 19'),
  ('Brilliant Locksmith (M) Sdn Bhd', 'Maybank', '5648 7460 7411'),
  ('ED MIA TRADING', 'Maybank', '5643 9712 5454'),
  ('Habu Mia', 'Public Bank', '487 420 9230'),
  ('Hossain Mozumder', 'Maybank', '164593155506'),
  ('How Kok Fatt', 'BSN', '1417729100000133'),
  ('KSLEE ENTERPRISE', 'Maybank', '5622 4530 0849'),
  ('LCH Spray Coating Enterprise', 'CIMB', '8002544953'),
  ('MK 86 ENTERPRISE', 'RHB Bank', '21202200151366'),
  ('Mohamad Amirul Afandi Bin Sukari', 'Public Bank', '6914948010'),
  ('Ooak Residence management', 'Alliance Bank', '141940010101692'),
  ('Ooak Suites management', 'Alliance Bank', '141940010101712'),
  ('Pest React Sdn Bhd', 'Public Bank', '3210170911'),
  ('Rojili Bin Gindog', 'Maybank', '564874591958'),
  ('Sia Geok Ling', 'Maybank', '1010 6810 8949'),
  ('Spic n Span Enterprise', 'Maybank', '564173516085'),
  ('Takaza Global Enterprise', 'Maybank', '564584357963'),
  ('The Cuci Clan Enterprise', 'Maybank', '564249459112'),
  ('Wong Hin Wai', 'Maybank', '114227100046'),
  ('YNH Utility Sdn Bhd', 'Public Bank', '3198856736');

-- ============================================================
-- SEED DATA: SERVICE DESCRIPTIONS
-- ============================================================

INSERT INTO service_descriptions (description, sort_order) VALUES
  ('Deep Clean', 1),
  ('Deep Clean & Steam Clean', 2),
  ('Steam Cleaning', 3),
  ('Air Cond Services', 4),
  ('Change Lightbulbs', 5),
  ('Touch Up Wall Painting', 6),
  ('Purchase of Electrical Appliances', 7),
  ('Purchase of Water Filter', 8),
  ('Purchase of Furnitures', 9),
  ('Install Panasonic Washlet', 10),
  ('All Cleaning & Services Done by Tenant', 11),
  ('Outstanding Electricity Bill', 12),
  ('Outstanding Water Bill', 13),
  ('Outstanding Indah Water', 14),
  ('Outstanding Rental', 15),
  ('Forfeit Deposit', 16),
  ('Washer / Dryer Repair', 17),
  ('Fridge Repair', 18),
  ('Ceiling Leaking Repair', 19),
  ('Door Repair', 20),
  ('Minor Repair', 21),
  ('Others', 22);

-- ============================================================
-- RLS POLICIES (enable after setting up auth)
-- ============================================================
-- ALTER TABLE units ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE records ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE services ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE service_descriptions ENABLE ROW LEVEL SECURITY;

-- For now (development), allow all authenticated users:
-- CREATE POLICY "Allow all for authenticated" ON units FOR ALL USING (auth.role() = 'authenticated');
-- CREATE POLICY "Allow all for authenticated" ON records FOR ALL USING (auth.role() = 'authenticated');
-- CREATE POLICY "Allow all for authenticated" ON services FOR ALL USING (auth.role() = 'authenticated');
-- CREATE POLICY "Allow all for authenticated" ON service_providers FOR ALL USING (auth.role() = 'authenticated');
-- CREATE POLICY "Allow all for authenticated" ON service_descriptions FOR ALL USING (auth.role() = 'authenticated');
