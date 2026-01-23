'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useCategory, useFeaturedCategories, useCreateFeaturedCategory, useDeleteFeaturedCategory } from '@/hooks';
import { DEFAULT_LANGUAGE } from '@/lib/constants';
import { CategoryForm } from '@/components/categories';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

interface CategoryPageProps {
  params: Promise<{ id: string }>;
}

export default function CategoryPage({ params }: CategoryPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { data: category, isLoading, error } = useCategory(resolvedParams.id);
  const { data: featuredCategories } = useFeaturedCategories();
  const createFeatured = useCreateFeaturedCategory();
  const deleteFeatured = useDeleteFeaturedCategory();

  // Check if this category is featured
  const featuredEntry = featuredCategories?.find((f) => f.category_id === resolvedParams.id);
  const isFeatured = !!featuredEntry;

  const handleToggleFeatured = async () => {
    try {
      if (isFeatured && featuredEntry) {
        await deleteFeatured.mutateAsync(featuredEntry.id);
        toast.success('Removed from featured');
      } else {
        await createFeatured.mutateAsync({ category_id: resolvedParams.id });
        toast.success('Added to featured');
      }
    } catch {
      toast.error('Failed to update featured status');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-96 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error || !category) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Button>
        <Alert variant="destructive">
          <AlertDescription>Category not found or failed to load.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const name = category.name[DEFAULT_LANGUAGE] || Object.values(category.name)[0] || 'Untitled';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
            <p className="text-gray-500">Edit category details</p>
          </div>
        </div>

        <Button
          variant={isFeatured ? 'outline' : 'default'}
          onClick={handleToggleFeatured}
          disabled={createFeatured.isPending || deleteFeatured.isPending}
        >
          {createFeatured.isPending || deleteFeatured.isPending ? (
            'Updating...'
          ) : isFeatured ? (
            <>
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Featured
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              Add to Featured
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Category Details</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryForm
            category={category}
            onSuccess={() => {
              router.push('/categories');
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
