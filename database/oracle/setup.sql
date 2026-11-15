--------------------------------------------------------------------------------
-- One-shot setup: creates MESS_APP (if missing) then instructs to run
-- schema.sql and seeds.sql as MESS_APP.
-- Run as SYSDBA:  sqlplus / as sysdba @database\oracle\setup.sql
--------------------------------------------------------------------------------
SET SERVEROUTPUT ON
WHENEVER SQLERROR EXIT SQL.SQLCODE

DECLARE
  v_cnt NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_cnt FROM DBA_USERS WHERE USERNAME='MESS_APP';
  IF v_cnt = 0 THEN
    EXECUTE IMMEDIATE 'CREATE USER MESS_APP IDENTIFIED BY "mess_1236" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS TEMPORARY TABLESPACE TEMP';
    EXECUTE IMMEDIATE 'GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW, CREATE PROCEDURE TO MESS_APP';
    DBMS_OUTPUT.PUT_LINE('MESS_APP created.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('MESS_APP already exists - leaving unchanged.');
  END IF;
END;
/
COMMIT;
EXIT;
