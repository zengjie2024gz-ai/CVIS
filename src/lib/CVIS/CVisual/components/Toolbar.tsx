import {Code, Settings} from "lucide-react"
import {useEffect, useState} from "react"
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarHeader,
    SidebarFooter,
} from "@/components/ui/sidebar.tsx"
import {Link, useLocation} from "react-router-dom"

export const Toolbar = () => {
    const [activeItem, setActiveItem] = useState<string | null>(null)
    const location = useLocation();

    useEffect(() => {
        const path = location.pathname.split("/").pop();
        setActiveItem(path || null);
    }, [location]);

    const handleItemClick = (item: string) => {
        setActiveItem(item === activeItem ? null : item)
    }

    return (
        <Sidebar className="border-r">
            <SidebarHeader className="h-14 border-b px-4 flex items-center justify-center">
                <h2 className="text-lg font-semibold">CVIS</h2>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Navigation</SidebarGroupLabel>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild onClick={() => handleItemClick("Code")}
                                               data-active={activeItem === "tool"}>
                                <Link to="/tool" className="flex items-center gap-3 px-3 py-2">
                                    <Code className="h-5 w-5"/>
                                    <span>Visualisation Playground</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton
                                asChild
                                onClick={() => handleItemClick("Settings")}
                                data-active={activeItem === "snippets"}
                            >
                                <Link to="/snippets" className="flex items-center gap-3 px-3 py-2">
                                    <Settings className="h-5 w-5"/>
                                    <span>Code Snippets</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>

                    </SidebarMenu>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="h-14 border-t flex items-center justify-center">
                <small>Originated by Ben McIlveen, extended by Tabitha Blindu 2026</small>
            </SidebarFooter>
        </Sidebar>
    )
}

