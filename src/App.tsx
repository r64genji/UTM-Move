import { Link, type RouteObject } from 'react-router'
import { ContributePage } from './features/info/ContributePage.tsx'
import { InfoPage } from './features/info/InfoPage.tsx'
import { HomePage } from './features/home/HomePage.tsx'
import { NavigatePage } from './features/navigate/NavigatePage.tsx'
import { SearchPage } from './features/places/SearchPage.tsx'
import { PlanPage } from './features/plan-trip/PlanPage.tsx'
import { RoutePage } from './features/routes/RoutePage.tsx'
import { RoutesPage } from './features/routes/RoutesPage.tsx'
import { StopPage } from './features/stops/StopPage.tsx'
import { Page } from './ui/Page.tsx'
import { Shell } from './ui/Shell.tsx'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'routes', element: <RoutesPage /> },
      { path: 'route/:id', element: <RoutePage /> },
      { path: 'stop/:id', element: <StopPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'plan', element: <PlanPage /> },
      { path: 'navigate', element: <NavigatePage /> },
      { path: 'info', element: <InfoPage /> },
      { path: 'contribute', element: <ContributePage /> },
      {
        path: '*',
        element: (
          <Page title="Page not found">
            <p className="pending">
              <Link to="/">Back to the map</Link>
            </p>
          </Page>
        ),
      },
    ],
  },
]
