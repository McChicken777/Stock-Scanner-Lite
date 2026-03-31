import { useState } from "react";
import { Link } from "wouter";
import { useListLocations, useCreateLocation, useDeleteLocation } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, MapPin, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  id: z.string().min(2, "Location ID is required").toUpperCase(),
  description: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

export default function LocationsPage() {
  const { data: locations, isLoading } = useListLocations();
  const deleteLocation = useDeleteLocation();
  const createLocation = useCreateLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { id: "", description: "" },
  });

  const filteredLocations = locations?.filter(l => 
    l.id.toLowerCase().includes(search.toLowerCase()) || 
    (l.description && l.description.toLowerCase().includes(search.toLowerCase()))
  );

  const handleDelete = (id: string) => {
    deleteLocation.mutate({ locationId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
        toast({ title: "Location deleted" });
      },
      onError: () => {
        toast({ title: "Cannot delete location", description: "Ensure it is empty first", variant: "destructive" });
      }
    });
  };

  const onSubmit = (data: FormValues) => {
    createLocation.mutate(
      { data: { id: data.id, description: data.description || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
          toast({ title: "Location created" });
          setIsCreateOpen(false);
          form.reset();
        },
        onError: () => toast({ title: "Failed to create location", variant: "destructive" })
      }
    );
  };

  return (
    <div className="p-4 flex flex-col min-h-full">
      <div className="flex items-center justify-between px-1 pt-2 mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Locations</h1>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="font-bold">
              <Plus className="h-4 w-4 mr-1" /> New
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Location</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Location ID</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. A1-01-02" className="h-12 font-mono uppercase border-2" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Description (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Top Shelf, Aisle 1" className="h-12 border-2" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="pt-4">
                  <Button type="submit" className="w-full h-12 font-bold text-lg" disabled={createLocation.isPending}>
                    {createLocation.isPending ? "Saving..." : "Save Location"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Search locations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-12 text-md shadow-sm bg-background border-2"
        />
      </div>

      <div className="flex-1 pb-8 space-y-3">
        {isLoading ? (
          [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : filteredLocations?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No locations found
          </div>
        ) : (
          filteredLocations?.map((location) => (
            <div key={location.id} className="bg-card rounded-xl p-4 border border-border shadow-sm flex items-center justify-between">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg font-mono text-foreground">{location.id}</h3>
                  {location.description && (
                    <p className="text-xs text-muted-foreground">{location.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="w-[90vw] max-w-md rounded-xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Location?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {location.id}. This cannot be undone. You can only delete empty locations.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0 mt-4">
                      <AlertDialogCancel className="h-12 w-full sm:w-auto">Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => handleDelete(location.id)}
                        className="h-12 w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                <Link href={`/location/${location.id}`}>
                  <Button variant="secondary" size="icon" className="h-10 w-10 rounded-full">
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}