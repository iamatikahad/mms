import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './store';
import Layout from './components/Layout';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/AdminDashboard';
import Members from './pages/admin/Members';
import Meals from './pages/admin/Meals';
import MealRequests from './pages/admin/MealRequests';
import Guests from './pages/admin/Guests';
import Bazar from './pages/admin/Bazar';
import Bills from './pages/admin/Bills';
import Deposits from './pages/admin/Deposits';
import Expenses from './pages/admin/Expenses';
import Reports from './pages/admin/Reports';
import Flowchart from './pages/admin/Flowchart';
import Closing from './pages/admin/Closing';
import Notifications from './pages/admin/Notifications';
import Admins from './pages/admin/Admins';
import Audit from './pages/admin/Audit';
import Settings from './pages/admin/Settings';
import Profile from './pages/admin/Profile';
import MyDashboard from './pages/member/MyDashboard';
import MyMeals from './pages/member/MyMeals';
import MyExpenses from './pages/member/MyExpenses';
import MyReports from './pages/member/MyReports';
import MyNotifications from './pages/member/MyNotifications';
import Chat from './pages/Chat';
import Polls from './pages/Polls';

function Guard({ children, roles, perm }: { children: React.ReactNode; roles?: string[]; perm?: string }) {
  const { user, loading } = useApp();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role === 'MEMBER' ? '/member' : '/admin'} replace />;
  if (perm && !user.permissions.includes(perm)) return <Navigate to={user.role === 'MEMBER' ? '/member' : '/admin'} replace />;
  return <>{children}</>;
}

export default function App() {
  const { user } = useApp();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Guard><Layout /></Guard>}>
        <Route index element={<Navigate to={user?.role === 'MEMBER' ? '/member' : '/admin'} replace />} />

        {/* Admin / Super Admin */}
        <Route path="admin" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><AdminDashboard /></Guard>} />
        <Route path="admin/members" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Members /></Guard>} />
        <Route path="admin/meals" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Meals /></Guard>} />
        <Route path="admin/meal-requests" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><MealRequests /></Guard>} />
        <Route path="admin/guests" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Guests /></Guard>} />
        <Route path="admin/bazar" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Bazar /></Guard>} />
        <Route path="admin/deposits" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Deposits /></Guard>} />
        <Route path="admin/expenses" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Expenses /></Guard>} />
        <Route path="admin/bills" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Bills /></Guard>} />
        <Route path="admin/reports" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Reports /></Guard>} />
        <Route path="admin/chat" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Chat /></Guard>} />
        <Route path="admin/polls" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Polls /></Guard>} />
        <Route path="admin/flowchart" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Flowchart /></Guard>} />
        <Route path="admin/closing" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Closing /></Guard>} />
        <Route path="admin/notifications" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Notifications /></Guard>} />
        <Route path="admin/admins" element={<Guard roles={['SUPER_ADMIN']}><Admins /></Guard>} />
        <Route path="admin/audit" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Audit /></Guard>} />
        <Route path="admin/settings" element={<Guard roles={['SUPER_ADMIN']}><Settings /></Guard>} />
        <Route path="admin/profile" element={<Guard roles={['ADMIN', 'SUPER_ADMIN']}><Profile /></Guard>} />

        {/* Member */}
        <Route path="member" element={<Guard roles={['MEMBER']}><MyDashboard /></Guard>} />
        <Route path="member/meals" element={<Guard roles={['MEMBER']}><MyMeals /></Guard>} />
        <Route path="member/chat" element={<Guard roles={['MEMBER']}><Chat /></Guard>} />
        <Route path="member/polls" element={<Guard roles={['MEMBER']}><Polls /></Guard>} />
        <Route path="member/expenses" element={<Guard roles={['MEMBER']}><MyExpenses /></Guard>} />
        <Route path="member/reports" element={<Guard roles={['MEMBER']}><MyReports /></Guard>} />
        <Route path="member/notifications" element={<Guard roles={['MEMBER']}><MyNotifications /></Guard>} />
        <Route path="member/profile" element={<Guard roles={['MEMBER']}><Profile /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
