import { Link, type RouteObject } from 'react-router'
import { ReportPage } from './features/feedback/ReportPage.tsx'
import { HomePage } from './features/home/HomePage.tsx'
import { NavigatePage } from './features/navigate/NavigatePage.tsx'
import { PlacePage } from './features/places/PlacePage.tsx'
import { SearchPage } from './features/places/SearchPage.tsx'
import { PlanPage } from './features/plan-trip/PlanPage.tsx'
import { RoutePage } from './features/routes/RoutePage.tsx'
import { StopPage } from './features/stops/StopPage.tsx'
import { StopsPage } from './features/stops/StopsPage.tsx'
import { Page } from './ui/Page.tsx'
import { Shell } from './ui/Shell.tsx'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'place/:id', element: <PlacePage /> },
      { path: 'plan', element: <PlanPage /> },
      { path: 'report', element: <ReportPage /> },
      { path: 'navigate', element: <NavigatePage /> },
      { path: 'stops', element: <StopsPage /> },
      { path: 'stop/:id', element: <StopPage /> },
      { path: 'route/:id', element: <RoutePage /> },
      {
        path: '*',
        element: (
          <Page title="Page not found">
            <p>
              <Link to="/">Back to the map</Link>
            </p>
          </Page>
        ),
      },
    ],
  },
]
