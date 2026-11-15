import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './store';
import Layout from './components/Layout';
import Login from './pages/Login';
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard'));
const Members = React.lazy(() => import('./pages/admin/Members'));
const Meals = React.lazy(() => import('./pages/admin/Meals'));
const MealRequests = React.lazy(() => import('./pages/admin/MealRequests'));
const Guests = React.lazy(() => import('./pages/admin/Guests'));
const Bazar = React.lazy(() => import('./pages/admin/Bazar'));
const Bills = React.lazy(() => import('./pages/admin/Bills'));
const Deposits = React.lazy(() => import('./pages/admin/Deposits'));
const Expenses = React.lazy(() => import('./pages/admin/Expenses'));
const Reports = React.lazy(() => import('./pages/admin/Reports'));
const Flowchart = React.lazy(() => import('./pages/admin/Flowchart'));
const Closing = React.lazy(() => import('./pages/admin/Closing'));
const Notifications = React.lazy(() => import('./pages/admin/Notifications'));
const Admins = React.lazy(() => import('./pages/admin/Admins'));
const Messes = React.lazy(() => import('./pages/admin/Messes'));
const Audit = React.lazy(() => import('./pages/admin/Audit'));
const Settings = React.lazy(() => import('./pages/admin/Settings'));
const Profile = React.lazy(() => import('./pages/admin/Profile'));
const MyDashboard = React.lazy(() => import('./pages/member/MyDashboard'));
const MyMeals = React.lazy(() => import('./pages/member/MyMeals'));
const MyExpenses = React.lazy(() => import('./pages/member/MyExpenses'));
const MyReports = React.lazy(() => import('./pages/member/MyReports'));
const MyNotifications = React.lazy(() => import('./pages/member/MyNotifications'));
const Chat = React.lazy(() => import('./pages/Chat'));
const Polls = React.lazy(() => import('./pages/Polls'));

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
    <React.Suspense fallback={<div className="p-8 text-center text-slate-500">Loading…</div>}>
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
        <Route path="admin/messes" element={<Guard roles={['SUPER_ADMIN']}><Messes /></Guard>} />
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
    </React.Suspense>
  );
}
