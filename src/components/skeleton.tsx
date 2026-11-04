// Grey placeholders in the shape of each page, shown while its data loads.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-md ${className}`} />;
}

function Box({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

function Rows({ n = 4, avatar }: { n?: number; avatar?: boolean }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          {avatar && <Bar className="h-9 w-9 shrink-0 rounded-full" />}
          <div className="flex-1 space-y-2">
            <Bar className={`h-3.5 ${["w-2/3", "w-1/2", "w-3/5", "w-2/5"][i % 4]}`} />
            <Bar className="h-3 w-1/3" />
          </div>
          <Bar className="h-8 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function CardSkeleton({ rows = 4, avatar }: { rows?: number; avatar?: boolean }) {
  return (
    <Box>
      <div className="border-b border-slate-100 px-4 py-3.5">
        <Bar className="h-4 w-40" />
      </div>
      <Rows n={rows} avatar={avatar} />
    </Box>
  );
}

/** Generic page: one card of rows. Screen readers hear "Loading". */
export function Loading({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading">
      <CardSkeleton rows={rows} />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-5">
      <div className="space-y-2">
        <Bar className="h-7 w-56" />
        <Bar className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Box key={i} className="space-y-2 px-4 py-3.5">
            <Bar className="h-3 w-20" />
            <Bar className="h-7 w-10" />
            <Bar className="h-3 w-24" />
          </Box>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <CardSkeleton rows={4} />
          <CardSkeleton rows={3} />
        </div>
        <div className="space-y-5">
          <CardSkeleton rows={3} avatar />
          <CardSkeleton rows={2} />
        </div>
      </div>
    </div>
  );
}

export function MatterSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-5">
      <Box className="p-5">
        <div className="flex items-center gap-2">
          <Bar className="h-7 w-32" />
          <Bar className="h-5 w-16 rounded-full" />
        </div>
        <Bar className="mt-2 h-4 w-80 max-w-full" />
        <div className="mt-5 flex items-center">
          {Array.from({ length: 11 }, (_, i) => (
            <div key={i} className="flex flex-1 items-center last:flex-none">
              <Bar className="h-7 w-7 shrink-0 rounded-full" />
              {i < 10 && <Bar className="mx-1 h-0.5 flex-1" />}
            </div>
          ))}
        </div>
        <Bar className="mt-3 h-4 w-60" />
      </Box>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-5">
          <div className="flex gap-4 border-b border-slate-200 pb-3">
            {["w-20", "w-16", "w-32", "w-20", "w-16", "w-16"].map((w, i) => (
              <Bar key={i} className={`h-4 ${w}`} />
            ))}
          </div>
          <CardSkeleton rows={3} />
          <div className="grid gap-5 xl:grid-cols-2">
            <CardSkeleton rows={2} />
            <CardSkeleton rows={2} />
          </div>
        </div>
        <Box className="order-first space-y-3 p-4 lg:order-none">
          <Bar className="h-4 w-24" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex justify-between gap-3">
              <Bar className="h-3.5 w-24" />
              <Bar className="h-3.5 w-16" />
            </div>
          ))}
        </Box>
      </div>
    </div>
  );
}
