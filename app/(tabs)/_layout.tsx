import { useEffect, useState } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { DeviceEventEmitter, StyleSheet } from 'react-native';

import { colors } from '@/src/constants/colors';
import { supabase } from '@/src/lib/supabase';

export default function TabLayout() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      setIsAuthenticated(Boolean(session));
      setIsLoading(false);
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      setIsAuthenticated(Boolean(session));
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#AEAEB2',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.1,
        },
        tabBarStyle: {
          height: 56,
          paddingTop: 4,
          paddingBottom: 6,
          backgroundColor: '#FFFFFF',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: '#E5E5EA',
        },
      }}>
      <Tabs.Screen
        name="index"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit('community:refresh-feed');
            }
          },
        })}
        options={{
          title: '홈',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: '검색',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: '업로드',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: '좋아요',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="simulation"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '프로필',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
