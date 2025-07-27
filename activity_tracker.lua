-- Activity Tracker Script for QBot
-- Place this in a LocalScript in StarterPlayerScripts or ServerScriptService

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

-- Configuration
local API_URL = "https://2fa13a96e070.ngrok-free.app/activity/update"
local API_KEY = "0518bf90665e301cfe8179f078637fba8bf7f1fccc2948edf1f8bce3a4ce374c"
local UPDATE_INTERVAL = 60 -- Update activity every 60 seconds (1 minute)

-- Store player activity data
local playerActivity = {}

-- Function to send activity update to API
local function sendActivityUpdate(robloxId, minutes)
    local success, response = pcall(function()
        local data = {
            robloxId = robloxId,
            minutes = minutes
        }
        
        local headers = {
            ["Content-Type"] = "application/json",
            ["Authorization"] = API_KEY
        }
        
        local response = HttpService:RequestAsync({
            Url = API_URL,
            Method = "POST",
            Headers = headers,
            Body = HttpService:JSONEncode(data)
        })
        
        if response.Success then
            local result = HttpService:JSONDecode(response.Body)
            if result.success then
                print("Activity updated successfully for player " .. robloxId)
            else
                warn("Failed to update activity: " .. (result.msg or "Unknown error"))
            end
        else
            warn("HTTP request failed: " .. response.StatusCode)
        end
    end)
    
    if not success then
        warn("Error sending activity update: " .. tostring(response))
    end
end

-- Function to update activity for all online players
local function updateAllPlayerActivity()
    for _, player in pairs(Players:GetPlayers()) do
        if playerActivity[player.UserId] then
            local minutes = math.floor(playerActivity[player.UserId] / 60)
            if minutes > 0 then
                sendActivityUpdate(player.UserId, minutes)
                playerActivity[player.UserId] = 0 -- Reset after sending
            end
        end
    end
end

-- Track player activity
local function trackPlayerActivity()
    for _, player in pairs(Players:GetPlayers()) do
        if not playerActivity[player.UserId] then
            playerActivity[player.UserId] = 0
        end
        playerActivity[player.UserId] = playerActivity[player.UserId] + (1/60) -- Add 1/60th of a second (since Heartbeat runs 60 times per second)
    end
end

-- Handle player joining
Players.PlayerAdded:Connect(function(player)
    playerActivity[player.UserId] = 0
    print("Started tracking activity for player: " .. player.Name .. " (ID: " .. player.UserId .. ")")
end)

-- Handle player leaving
Players.PlayerRemoving:Connect(function(player)
    -- Send final activity update before player leaves
    if playerActivity[player.UserId] then
        local minutes = math.floor(playerActivity[player.UserId] / 60)
        if minutes > 0 then
            sendActivityUpdate(player.UserId, minutes)
        end
        playerActivity[player.UserId] = nil
    end
    print("Stopped tracking activity for player: " .. player.Name .. " (ID: " .. player.UserId .. ")")
end)

-- Main activity tracking loop
RunService.Heartbeat:Connect(function()
    trackPlayerActivity()
end)

-- Periodic activity updates
while true do
    wait(UPDATE_INTERVAL)
    updateAllPlayerActivity()
end

print("Activity tracker started successfully!")
print("API URL: " .. API_URL)
print("Update interval: " .. UPDATE_INTERVAL .. " seconds") 