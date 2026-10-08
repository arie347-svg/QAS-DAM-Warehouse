import React, { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { HomePage } from '../features/home/HomePage';

const AuditListPage = lazy(() => import('../features/audit/AuditListPage').then((m) => ({ default: m.AuditListPage })));
const SelfAuditPage = lazy(() => import('../features/audit/SelfAuditPage').then((m) => ({ default: m.SelfAuditPage })));
const MasterTemplatePage = lazy(() => import('../features/master/MasterTemplatePage').then((m) => ({ default: m.MasterTemplatePage })));
const StatusPage = lazy(() => import('../features/status/StatusPage').then((m) => ({ default: m.StatusPage })));
const ComparisonPage = lazy(() => import('../features/comparison/ComparisonPage').then((m) => ({ default: m.ComparisonPage })));
const ReportsPage = lazy(() => import('../features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const MoreProfilePage = lazy(() => import('../features/more/MoreProfilePage').then((m) => ({ default: m.MoreProfilePage })));
const FindingFormPage = lazy(() => import('../features/findings/FindingFormPage').then((m) => ({ default: m.FindingFormPage })));
const UserManagementPage = lazy(() => import('../features/users/UserManagementPage').then((m) => ({ default: m.UserManagementPage })));

const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={<div className="p-8 flex items-center justify-center text-slate-400 text-xs font-semibold">Memuat data...</div>}>
    {element}
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'cycles',
        element: withSuspense(<AuditListPage />),
      },
      {
        path: 'audits',
        element: withSuspense(<AuditListPage />),
      },
      {
        path: 'audits/:id',
        element: withSuspense(<SelfAuditPage />),
      },
      {
        path: 'comparisons/:cycleId/:depotId',
        element: withSuspense(<ComparisonPage />),
      },
      {
        path: 'master',
        element: withSuspense(<MasterTemplatePage />),
      },
      {
        path: 'status',
        element: withSuspense(<StatusPage />),
      },
      {
        path: 'users',
        element: withSuspense(<UserManagementPage />),
      },
      {
        path: 'reports',
        element: withSuspense(<ReportsPage />),
      },
      {
        path: 'export',
        element: withSuspense(<ReportsPage />),
      },
      {
        path: 'more',
        element: withSuspense(<MoreProfilePage />),
      },
      {
        path: 'findings',
        element: withSuspense(<FindingFormPage />),
      },
      {
        path: '*',
        element: (
          <div className="bg-white rounded-xl shadow-sm border border-qas-midGrey p-8 text-center max-w-md mx-auto my-12">
            <h2 className="text-xl font-bold text-qas-navy mb-2">Halaman Tidak Ditemukan</h2>
            <p className="text-xs text-gray-500 mb-4">Halaman yang Anda tuju tidak tersedia.</p>
            <a href="/" className="inline-block px-4 py-2 bg-qas-navy text-white text-xs font-medium rounded-lg">
              Kembali ke Beranda
            </a>
          </div>
        ),
      },
    ],
  },
]);
