--------------------------------------------------------------------------------
-- Mess Management System - Seed Data (Oracle 12c)
-- Idempotent: safe to run multiple times.
--------------------------------------------------------------------------------
SET DEFINE OFF
SET SERVEROUTPUT ON
WHENEVER SQLERROR EXIT SQL.SQLCODE

--------------------------------------------------------------------------------
-- ROLES
--------------------------------------------------------------------------------
MERGE INTO ROLES r USING (SELECT 'SUPER_ADMIN' AS RN, 'Full system control' AS D FROM DUAL)
ON (r.ROLE_NAME = 'SUPER_ADMIN')
WHEN NOT MATCHED THEN INSERT (ROLE_NAME, DESCRIPTION) VALUES ('SUPER_ADMIN','Full system control');
/
MERGE INTO ROLES r USING (SELECT 'ADMIN' AS RN, 'Administrative access (configurable)' AS D FROM DUAL)
ON (r.ROLE_NAME = 'ADMIN')
WHEN NOT MATCHED THEN INSERT (ROLE_NAME, DESCRIPTION) VALUES ('ADMIN','Administrative access (configurable)');
/
MERGE INTO ROLES r USING (SELECT 'MEMBER' AS RN, 'Mess member' AS D FROM DUAL)
ON (r.ROLE_NAME = 'MEMBER')
WHEN NOT MATCHED THEN INSERT (ROLE_NAME, DESCRIPTION) VALUES ('MEMBER','Mess member');
/

--------------------------------------------------------------------------------
-- PERMISSIONS
--------------------------------------------------------------------------------
MERGE INTO PERMISSIONS p USING (SELECT 'dashboard.view' K, 'View dashboard' D FROM DUAL)
ON (p.PERMISSION_KEY='dashboard.view') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('dashboard.view','View dashboard');
/
MERGE INTO PERMISSIONS p USING (SELECT 'members.view' K, 'View members' D FROM DUAL)
ON (p.PERMISSION_KEY='members.view') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('members.view','View members');
/
MERGE INTO PERMISSIONS p USING (SELECT 'members.manage' K, 'Manage members' D FROM DUAL)
ON (p.PERMISSION_KEY='members.manage') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('members.manage','Manage members');
/
MERGE INTO PERMISSIONS p USING (SELECT 'meals.view' K, 'View meals' D FROM DUAL)
ON (p.PERMISSION_KEY='meals.view') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('meals.view','View meals');
/
MERGE INTO PERMISSIONS p USING (SELECT 'meals.manage' K, 'Manage meal entries' D FROM DUAL)
ON (p.PERMISSION_KEY='meals.manage') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('meals.manage','Manage meal entries');
/
MERGE INTO PERMISSIONS p USING (SELECT 'meals.request' K, 'Submit meal requests' D FROM DUAL)
ON (p.PERMISSION_KEY='meals.request') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('meals.request','Submit meal requests');
/
MERGE INTO PERMISSIONS p USING (SELECT 'meals.override' K, 'Override locked meal requests' D FROM DUAL)
ON (p.PERMISSION_KEY='meals.override') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('meals.override','Override locked meal requests');
/
MERGE INTO PERMISSIONS p USING (SELECT 'guests.manage' K, 'Manage guest meals' D FROM DUAL)
ON (p.PERMISSION_KEY='guests.manage') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('guests.manage','Manage guest meals');
/
MERGE INTO PERMISSIONS p USING (SELECT 'bazar.manage' K, 'Manage bazar expenses' D FROM DUAL)
ON (p.PERMISSION_KEY='bazar.manage') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('bazar.manage','Manage bazar expenses');
/
MERGE INTO PERMISSIONS p USING (SELECT 'bills.manage' K, 'Manage monthly bills' D FROM DUAL)
ON (p.PERMISSION_KEY='bills.manage') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('bills.manage','Manage monthly bills');
/
MERGE INTO PERMISSIONS p USING (SELECT 'deposits.manage' K, 'Manage deposits' D FROM DUAL)
ON (p.PERMISSION_KEY='deposits.manage') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('deposits.manage','Manage deposits');
/
MERGE INTO PERMISSIONS p USING (SELECT 'expenses.manage' K, 'Manage other charges' D FROM DUAL)
ON (p.PERMISSION_KEY='expenses.manage') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('expenses.manage','Manage other charges');
/
MERGE INTO PERMISSIONS p USING (SELECT 'reports.view' K, 'View reports' D FROM DUAL)
ON (p.PERMISSION_KEY='reports.view') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('reports.view','View reports');
/
MERGE INTO PERMISSIONS p USING (SELECT 'reports.export' K, 'Export reports' D FROM DUAL)
ON (p.PERMISSION_KEY='reports.export') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('reports.export','Export reports');
/
MERGE INTO PERMISSIONS p USING (SELECT 'flowchart.view' K, 'View calculation flowchart' D FROM DUAL)
ON (p.PERMISSION_KEY='flowchart.view') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('flowchart.view','View calculation flowchart');
/
MERGE INTO PERMISSIONS p USING (SELECT 'closing.view' K, 'View monthly closing' D FROM DUAL)
ON (p.PERMISSION_KEY='closing.view') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('closing.view','View monthly closing');
/
MERGE INTO PERMISSIONS p USING (SELECT 'closing.manage' K, 'Close months' D FROM DUAL)
ON (p.PERMISSION_KEY='closing.manage') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('closing.manage','Close months');
/
MERGE INTO PERMISSIONS p USING (SELECT 'closing.reopen' K, 'Reopen closed months' D FROM DUAL)
ON (p.PERMISSION_KEY='closing.reopen') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('closing.reopen','Reopen closed months');
/
MERGE INTO PERMISSIONS p USING (SELECT 'notifications.manage' K, 'Send notifications' D FROM DUAL)
ON (p.PERMISSION_KEY='notifications.manage') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('notifications.manage','Send notifications');
/
MERGE INTO PERMISSIONS p USING (SELECT 'admins.manage' K, 'Manage admin accounts' D FROM DUAL)
ON (p.PERMISSION_KEY='admins.manage') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('admins.manage','Manage admin accounts');
/
MERGE INTO PERMISSIONS p USING (SELECT 'audit.view' K, 'View audit logs' D FROM DUAL)
ON (p.PERMISSION_KEY='audit.view') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('audit.view','View audit logs');
/
MERGE INTO PERMISSIONS p USING (SELECT 'settings.manage' K, 'Manage settings' D FROM DUAL)
ON (p.PERMISSION_KEY='settings.manage') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('settings.manage','Manage settings');
/
MERGE INTO PERMISSIONS p USING (SELECT 'profile.manage' K, 'Manage own profile' D FROM DUAL)
ON (p.PERMISSION_KEY='profile.manage') WHEN NOT MATCHED THEN INSERT(PERMISSION_KEY,DESCRIPTION) VALUES('profile.manage','Manage own profile');
/

--------------------------------------------------------------------------------
-- ROLE_PERMISSIONS: SUPER_ADMIN gets everything
--------------------------------------------------------------------------------
INSERT INTO ROLE_PERMISSIONS (ROLE_ID, PERMISSION_ID)
SELECT r.ROLE_ID, p.PERMISSION_ID FROM ROLES r, PERMISSIONS p
WHERE r.ROLE_NAME='SUPER_ADMIN'
  AND NOT EXISTS (SELECT 1 FROM ROLE_PERMISSIONS rp WHERE rp.ROLE_ID=r.ROLE_ID AND rp.PERMISSION_ID=p.PERMISSION_ID);
/

--------------------------------------------------------------------------------
-- ROLE_PERMISSIONS: ADMIN default set (Super Admin can revise)
--------------------------------------------------------------------------------
INSERT INTO ROLE_PERMISSIONS (ROLE_ID, PERMISSION_ID)
SELECT r.ROLE_ID, p.PERMISSION_ID FROM ROLES r, PERMISSIONS p
WHERE r.ROLE_NAME='ADMIN'
  AND p.PERMISSION_KEY IN (
    'dashboard.view','members.view','members.manage',
    'meals.view','meals.manage','meals.override',
    'guests.manage','bazar.manage','bills.manage',
    'deposits.manage','expenses.manage',
    'reports.view','reports.export','flowchart.view',
    'closing.view','closing.manage',
    'notifications.manage','audit.view','profile.manage'
  )
  AND NOT EXISTS (SELECT 1 FROM ROLE_PERMISSIONS rp WHERE rp.ROLE_ID=r.ROLE_ID AND rp.PERMISSION_ID=p.PERMISSION_ID);
/

--------------------------------------------------------------------------------
-- ROLE_PERMISSIONS: MEMBER
--------------------------------------------------------------------------------
INSERT INTO ROLE_PERMISSIONS (ROLE_ID, PERMISSION_ID)
SELECT r.ROLE_ID, p.PERMISSION_ID FROM ROLES r, PERMISSIONS p
WHERE r.ROLE_NAME='MEMBER'
  AND p.PERMISSION_KEY IN (
    'dashboard.view','meals.request','reports.view','flowchart.view',
    'notifications.manage','profile.manage'
  )
  AND NOT EXISTS (SELECT 1 FROM ROLE_PERMISSIONS rp WHERE rp.ROLE_ID=r.ROLE_ID AND rp.PERMISSION_ID=p.PERMISSION_ID);
/

--------------------------------------------------------------------------------
-- EXPENSE_CATEGORIES (food-eligible bazar categories)
--------------------------------------------------------------------------------
MERGE INTO EXPENSE_CATEGORIES c USING (SELECT 'Rice' N FROM DUAL) ON (c.CATEGORY_NAME='Rice') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,IS_FOOD_ELIGIBLE) VALUES('Rice',1);
/
MERGE INTO EXPENSE_CATEGORIES c USING (SELECT 'Oil' N FROM DUAL) ON (c.CATEGORY_NAME='Oil') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,IS_FOOD_ELIGIBLE) VALUES('Oil',1);
/
MERGE INTO EXPENSE_CATEGORIES c USING (SELECT 'Vegetables' N FROM DUAL) ON (c.CATEGORY_NAME='Vegetables') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,IS_FOOD_ELIGIBLE) VALUES('Vegetables',1);
/
MERGE INTO EXPENSE_CATEGORIES c USING (SELECT 'Fish' N FROM DUAL) ON (c.CATEGORY_NAME='Fish') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,IS_FOOD_ELIGIBLE) VALUES('Fish',1);
/
MERGE INTO EXPENSE_CATEGORIES c USING (SELECT 'Meat' N FROM DUAL) ON (c.CATEGORY_NAME='Meat') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,IS_FOOD_ELIGIBLE) VALUES('Meat',1);
/
MERGE INTO EXPENSE_CATEGORIES c USING (SELECT 'Eggs' N FROM DUAL) ON (c.CATEGORY_NAME='Eggs') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,IS_FOOD_ELIGIBLE) VALUES('Eggs',1);
/
MERGE INTO EXPENSE_CATEGORIES c USING (SELECT 'Spices' N FROM DUAL) ON (c.CATEGORY_NAME='Spices') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,IS_FOOD_ELIGIBLE) VALUES('Spices',1);
/
MERGE INTO EXPENSE_CATEGORIES c USING (SELECT 'Other Food Items' N FROM DUAL) ON (c.CATEGORY_NAME='Other Food Items') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,IS_FOOD_ELIGIBLE) VALUES('Other Food Items',1);
/
MERGE INTO EXPENSE_CATEGORIES c USING (SELECT 'Non-Food (excluded)' N FROM DUAL) ON (c.CATEGORY_NAME='Non-Food (excluded)') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,IS_FOOD_ELIGIBLE) VALUES('Non-Food (excluded)',0);
/

--------------------------------------------------------------------------------
-- BILL_CATEGORIES (household bills, equal allocation by default)
--------------------------------------------------------------------------------
MERGE INTO BILL_CATEGORIES c USING (SELECT 'Khala / Cook Salary' N FROM DUAL) ON (c.CATEGORY_NAME='Khala / Cook Salary') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,ALLOCATION_METHOD) VALUES('Khala / Cook Salary','EQUAL');
/
MERGE INTO BILL_CATEGORIES c USING (SELECT 'Internet Bill' N FROM DUAL) ON (c.CATEGORY_NAME='Internet Bill') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,ALLOCATION_METHOD) VALUES('Internet Bill','EQUAL');
/
MERGE INTO BILL_CATEGORIES c USING (SELECT 'Garbage / Cleaning' N FROM DUAL) ON (c.CATEGORY_NAME='Garbage / Cleaning') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,ALLOCATION_METHOD) VALUES('Garbage / Cleaning','EQUAL');
/
MERGE INTO BILL_CATEGORIES c USING (SELECT 'Gas Bill' N FROM DUAL) ON (c.CATEGORY_NAME='Gas Bill') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,ALLOCATION_METHOD) VALUES('Gas Bill','EQUAL');
/
MERGE INTO BILL_CATEGORIES c USING (SELECT 'Electricity Bill' N FROM DUAL) ON (c.CATEGORY_NAME='Electricity Bill') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,ALLOCATION_METHOD) VALUES('Electricity Bill','EQUAL');
/
MERGE INTO BILL_CATEGORIES c USING (SELECT 'Water Bill' N FROM DUAL) ON (c.CATEGORY_NAME='Water Bill') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,ALLOCATION_METHOD) VALUES('Water Bill','EQUAL');
/
MERGE INTO BILL_CATEGORIES c USING (SELECT 'House Rent' N FROM DUAL) ON (c.CATEGORY_NAME='House Rent') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,ALLOCATION_METHOD) VALUES('House Rent','EQUAL');
/
MERGE INTO BILL_CATEGORIES c USING (SELECT 'Maintenance' N FROM DUAL) ON (c.CATEGORY_NAME='Maintenance') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,ALLOCATION_METHOD) VALUES('Maintenance','EQUAL');
/
MERGE INTO BILL_CATEGORIES c USING (SELECT 'Other Bills' N FROM DUAL) ON (c.CATEGORY_NAME='Other Bills') WHEN NOT MATCHED THEN INSERT(CATEGORY_NAME,ALLOCATION_METHOD) VALUES('Other Bills','EQUAL');
/

--------------------------------------------------------------------------------
-- SYSTEM_SETTINGS
--------------------------------------------------------------------------------
MERGE INTO SYSTEM_SETTINGS s USING (SELECT 'app.mess_name' K FROM DUAL)
ON (s.SETTING_KEY='app.mess_name')
WHEN MATCHED THEN UPDATE SET SETTING_VALUE='The Attic 712', UPDATED_AT=SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT(SETTING_KEY,SETTING_VALUE,DESCRIPTION) VALUES('app.mess_name','The Attic 712','Display name of the mess shown across the application and reports');
/
MERGE INTO SYSTEM_SETTINGS s USING (SELECT 'app.timezone' K FROM DUAL)
ON (s.SETTING_KEY='app.timezone')
WHEN MATCHED THEN UPDATE SET SETTING_VALUE='Asia/Dhaka', UPDATED_AT=SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT(SETTING_KEY,SETTING_VALUE,DESCRIPTION) VALUES('app.timezone','Asia/Dhaka','Application timezone');
/
MERGE INTO SYSTEM_SETTINGS s USING (SELECT 'app.currency' K FROM DUAL)
ON (s.SETTING_KEY='app.currency')
WHEN MATCHED THEN UPDATE SET SETTING_VALUE='BDT', UPDATED_AT=SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT(SETTING_KEY,SETTING_VALUE,DESCRIPTION) VALUES('app.currency','BDT','Currency code');
/
MERGE INTO SYSTEM_SETTINGS s USING (SELECT 'meal.lunch_cutoff' K FROM DUAL)
ON (s.SETTING_KEY='meal.lunch_cutoff')
WHEN MATCHED THEN UPDATE SET SETTING_VALUE='10:00', UPDATED_AT=SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT(SETTING_KEY,SETTING_VALUE,DESCRIPTION) VALUES('meal.lunch_cutoff','10:00','Lunch request cutoff (HH24:MI, Asia/Dhaka)');
/
MERGE INTO SYSTEM_SETTINGS s USING (SELECT 'meal.dinner_cutoff' K FROM DUAL)
ON (s.SETTING_KEY='meal.dinner_cutoff')
WHEN MATCHED THEN UPDATE SET SETTING_VALUE='19:30', UPDATED_AT=SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT(SETTING_KEY,SETTING_VALUE,DESCRIPTION) VALUES('meal.dinner_cutoff','19:30','Dinner request cutoff (HH24:MI, Asia/Dhaka)');
/
MERGE INTO SYSTEM_SETTINGS s USING (SELECT 'meal.lunch_time' K FROM DUAL)
ON (s.SETTING_KEY='meal.lunch_time')
WHEN MATCHED THEN UPDATE SET SETTING_VALUE='10:00', UPDATED_AT=SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT(SETTING_KEY,SETTING_VALUE,DESCRIPTION) VALUES('meal.lunch_time','10:00','Lunch serving time (HH24:MI, Asia/Dhaka)');
/
MERGE INTO SYSTEM_SETTINGS s USING (SELECT 'meal.dinner_time' K FROM DUAL)
ON (s.SETTING_KEY='meal.dinner_time')
WHEN MATCHED THEN UPDATE SET SETTING_VALUE='19:30', UPDATED_AT=SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT(SETTING_KEY,SETTING_VALUE,DESCRIPTION) VALUES('meal.dinner_time','19:30','Dinner serving time (HH24:MI, Asia/Dhaka)');
/
MERGE INTO SYSTEM_SETTINGS s USING (SELECT 'meal.max_regular_per_meal' K FROM DUAL)
ON (s.SETTING_KEY='meal.max_regular_per_meal')
WHEN MATCHED THEN UPDATE SET SETTING_VALUE='1', UPDATED_AT=SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT(SETTING_KEY,SETTING_VALUE,DESCRIPTION) VALUES('meal.max_regular_per_meal','1','Max regular meals per member per meal type per day');
/
MERGE INTO SYSTEM_SETTINGS s USING (SELECT 'meal.max_guests_per_meal' K FROM DUAL)
ON (s.SETTING_KEY='meal.max_guests_per_meal')
WHEN MATCHED THEN UPDATE SET SETTING_VALUE='10', UPDATED_AT=SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT(SETTING_KEY,SETTING_VALUE,DESCRIPTION) VALUES('meal.max_guests_per_meal','10','Max guest meals per member per meal type per day');
/
MERGE INTO SYSTEM_SETTINGS s USING (SELECT 'bill.allocation_method' K FROM DUAL)
ON (s.SETTING_KEY='bill.allocation_method')
WHEN MATCHED THEN UPDATE SET SETTING_VALUE='EQUAL', UPDATED_AT=SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT(SETTING_KEY,SETTING_VALUE,DESCRIPTION) VALUES('bill.allocation_method','EQUAL','Default bill allocation method');
/
MERGE INTO SYSTEM_SETTINGS s USING (SELECT 'auth.session_hours' K FROM DUAL)
ON (s.SETTING_KEY='auth.session_hours')
WHEN MATCHED THEN UPDATE SET SETTING_VALUE='12', UPDATED_AT=SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT(SETTING_KEY,SETTING_VALUE,DESCRIPTION) VALUES('auth.session_hours','12','Session lifetime in hours');
/

--------------------------------------------------------------------------------
-- SUPER ADMIN user (password hash generated by backend setup script)
-- Username: superadmin  Password: set via backend/scripts/create-admin or change below.
--------------------------------------------------------------------------------
DECLARE
  v_role NUMBER;
  v_hash VARCHAR2(200) := '$2a$10$Ggp7gOmmTXW.iS8gHFMQBOsQnzKX/JteLy9acg.NGhawA7wPz4Hda';
BEGIN
  SELECT ROLE_ID INTO v_role FROM ROLES WHERE ROLE_NAME='SUPER_ADMIN';
  INSERT INTO USERS (USERNAME, EMAIL, FULL_NAME, ROLE_ID, STATUS, PASSWORD_HASH)
  SELECT 'superadmin', 'superadmin@mess.local', 'Super Administrator', v_role, 'ACTIVE', v_hash
  FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM USERS WHERE USERNAME='superadmin');
END;
/

COMMIT;
SELECT 'SEEDS APPLIED' AS RESULT FROM DUAL;
EXIT;
