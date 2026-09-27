import { Redirect } from 'expo-router';

import { useAppState } from '@/lib/app-state';

export default function Index() {
  const { onboarded } = useAppState();
  return <Redirect href={onboarded ? '/welcome' : '/onboarding'} />;
}
