import React from "react";
import { Link, Outlet } from "react-router-dom";
import { useLeadImport } from "@/contexts/LeadImportContext";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import AdminEODSummary from "@/components/AdminEODSummary";
import { useOrganization } from "@/contexts/OrganizationContext";

export default function AppLayout() {
  const { activeOrganizationId } = useOrganization();
  const { runningJobs } = useLeadImport();
  return (
    <div className="flex min-h-screen bg-bone">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        {runningJobs.map(job => <div key={job.organizationId} role="status" className="px-8 py-3 bg-forest text-white text-sm">
          Importing {job.fileName} into {job.organizationName}: {(job.progress?.completed || 0).toLocaleString()}/{(job.progress?.total || 0).toLocaleString()} rows processed. You can keep working. <Link to="/data-import" className="underline">View import</Link>
        </div>)}
        <main className="flex-1 min-w-0 p-8 animate-fade-in">
          <div key={activeOrganizationId || "unselected"}><Outlet /></div>
        </main>
      </div>
      <AdminEODSummary mode="modal-controller" />
    </div>
  );
}
